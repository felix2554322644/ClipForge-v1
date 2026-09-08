import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { ScriptArtifact, NarrationArtifact, NarrationLineTiming } from '../../contracts/artifacts';
import { AppConfig } from '../../config';
import { AudioMeasurer } from './audioMeasurer';
import { PipelineLogger } from '../logging/logger';

export class PiperNarrationEngine {
  private audioMeasurer: AudioMeasurer;

  constructor(private config: AppConfig, private logger: PipelineLogger) {
    this.audioMeasurer = new AudioMeasurer(config.ffprobeBin);
  }

  public async synthesizeNarration(
    script: ScriptArtifact,
    outputDir: string,
    allowFallback = true
  ): Promise<NarrationArtifact> {
    this.logger.stageStart('narration', `Beats: ${script.spokenLines.length}, Words: ${script.totalWordCount}`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const audioOutputPath = path.join(outputDir, 'narration.wav');

    const piperInstalled = fs.existsSync(this.config.piperBin) || this.canExecute(this.config.piperBin);
    const modelExists = fs.existsSync(this.config.piperModel);

    let engineUsed: 'piper' | 'fallback_sine' | 'fallback_gemini' = 'piper';

    if (piperInstalled && modelExists) {
      try {
        this.logger.stageProgress('narration', `Executing Piper local TTS: ${this.config.piperBin} with model ${path.basename(this.config.piperModel)}`);
        this.synthesizeWithPiper(script.fullText, audioOutputPath);
        engineUsed = 'piper';
      } catch (err: any) {
        this.logger.stageError('narration', err);
        if (!allowFallback && !this.config.allowFallbacks) {
          throw new Error(`Piper synthesis failed: ${err.message || err}`);
        }
        this.logger.warn('narration', 'Piper failed; switching to development audio fallback.');
        this.synthesizeWithFallback(script, audioOutputPath);
        engineUsed = 'fallback_sine';
      }
    } else {
      if (!allowFallback && !this.config.allowFallbacks) {
        throw new Error(
          `Piper TTS is not available. Binary: "${this.config.piperBin}" (exists: ${piperInstalled}), Model: "${this.config.piperModel}" (exists: ${modelExists}). Run scripts/setup-piper.sh to install.`
        );
      }
      this.logger.warn(
        'narration',
        `Piper TTS not configured (bin: ${piperInstalled}, model: ${modelExists}). Using audio synthesizer fallback.`
      );
      this.synthesizeWithFallback(script, audioOutputPath);
      engineUsed = 'fallback_sine';
    }

    // Measure exact actual audio duration with FFprobe (MANDATORY TIMING ANCHOR)
    this.logger.stageProgress('narration', `Measuring generated audio with FFprobe: ${audioOutputPath}`);
    const probe = this.audioMeasurer.probeAudio(audioOutputPath);
    const actualDurationSec = probe.durationSec;

    // Calculate line timings anchored to the actual audio duration
    const lineTimings = this.calculateLineTimings(script, actualDurationSec);

    const artifact: NarrationArtifact = {
      text: script.fullText,
      audioPath: audioOutputPath,
      audioDurationSec: actualDurationSec,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      voiceConfig: {
        engine: engineUsed,
        modelPath: engineUsed === 'piper' ? this.config.piperModel : undefined,
        voiceName: engineUsed === 'piper' ? path.basename(this.config.piperModel, '.onnx') : 'test_cadence_voice',
      },
      lineTimings,
      measuredWith: 'ffprobe',
      metadata: {
        generatedAt: new Date().toISOString(),
      },
    };

    this.logger.stageCompleted(
      'narration',
      `Audio generated (${engineUsed}): ${actualDurationSec.toFixed(2)}s, ${probe.sampleRate}Hz, ${probe.channels}ch`
    );

    return artifact;
  }

  private synthesizeWithPiper(text: string, outputPath: string) {
    const proc = spawnSync(
      this.config.piperBin,
      ['--model', this.config.piperModel, '--output_file', outputPath],
      {
        input: text,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    if (proc.error) {
      throw proc.error;
    }

    if (proc.status !== 0) {
      throw new Error(`Piper process exited with code ${proc.status}: ${proc.stderr}`);
    }

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error(`Piper did not produce an output audio file at ${outputPath}`);
    }
  }

  private synthesizeWithFallback(script: ScriptArtifact, outputPath: string) {
    // Generate spoken-cadence rhythm audio using FFmpeg aevalsrc / sine modulated tone
    // Duration precisely tracks estimated script duration
    const durationSec = Math.max(8, script.estimatedDurationSec || (script.totalWordCount / 2.6));
    
    // Create an expressive audio track with gentle modulation matching spoken cadence
    const cmd = `${this.config.ffmpegBin} -y -f lavfi -i "anoisesrc=d=${durationSec}:c=pink:r=22050:a=0.03,lowpass=f=1200,volume=0.8" -ar 22050 -ac 1 "${outputPath}"`;
    const res = spawnSync(this.config.ffmpegBin, [
      '-y',
      '-f', 'lavfi',
      '-i', `aevalsrc=sin(440*2*PI*t)*0.15*sin(5*2*PI*t)+sin(220*2*PI*t)*0.1:d=${durationSec.toFixed(2)}:s=22050`,
      '-ar', '22050',
      '-ac', '1',
      outputPath
    ], { stdio: 'pipe' });

    if (res.status !== 0 || !fs.existsSync(outputPath)) {
      throw new Error(`Fallback audio generation failed: ${res.stderr?.toString()}`);
    }
  }

  private canExecute(cmd: string): boolean {
    try {
      const res = spawnSync(cmd, ['--version'], { stdio: 'pipe' });
      return res.status === 0;
    } catch {
      return false;
    }
  }

  private calculateLineTimings(script: ScriptArtifact, actualDurationSec: number): NarrationLineTiming[] {
    const totalWords = Math.max(1, script.totalWordCount);
    let accumulatedTime = 0;

    return script.spokenLines.map((line, idx) => {
      const wordsInLine = Math.max(1, line.text.split(/\s+/).filter(Boolean).length);
      const proportion = wordsInLine / totalWords;
      const isLast = idx === script.spokenLines.length - 1;
      const lineDuration = isLast
        ? Number((actualDurationSec - accumulatedTime).toFixed(3))
        : Number((actualDurationSec * proportion).toFixed(3));

      const startTimeSec = Number(accumulatedTime.toFixed(3));
      accumulatedTime += lineDuration;

      return {
        index: line.index,
        text: line.text,
        startTimeSec,
        durationSec: lineDuration,
      };
    });
  }
}
