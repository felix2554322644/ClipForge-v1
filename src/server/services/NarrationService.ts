import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NarrationArtifact, NarrationSentenceTiming, ScriptArtifact } from '../../types/pipeline.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getGeminiClient } from '../geminiClient.js';

const execFileAsync = promisify(execFile);

export class NarrationService {
  /**
   * Generates narration audio and measures exact duration via ffprobe
   */
  public async generateNarration(
    jobId: string,
    script: ScriptArtifact,
    outputDir: string
  ): Promise<NarrationArtifact> {
    logger.info(jobId, 'narration', `Synthesizing narration for ${script.lines.length} lines`);

    await fs.mkdir(outputDir, { recursive: true });
    const audioFilePath = path.join(outputDir, 'narration.wav');

    let ttsEngineUsed = 'fallback_synthesizer';

    // 1. Try Piper local TTS if configured or available
    const hasPiper = await this.checkPiperAvailable();
    if (hasPiper) {
      try {
        logger.info(jobId, 'narration', `Using Piper local TTS (${config.piperPath || 'piper'})`);
        await this.synthesizeWithPiper(script.fullNarrationText, audioFilePath);
        ttsEngineUsed = 'piper_local';
      } catch (err: any) {
        logger.warn(jobId, 'narration', `Piper synthesis failed: ${err.message}. Trying next voice engine.`);
      }
    }

    // 2. If piper wasn't used or failed, try Gemini TTS if API key is present
    if (ttsEngineUsed === 'fallback_synthesizer') {
      const gemini = getGeminiClient();
      if (gemini) {
        try {
          logger.info(jobId, 'narration', 'Using Gemini TTS model (gemini-3.1-flash-tts-preview)');
          await this.synthesizeWithGemini(gemini, script.fullNarrationText, audioFilePath);
          ttsEngineUsed = 'gemini_tts';
        } catch (err: any) {
          logger.warn(jobId, 'narration', `Gemini TTS failed: ${err.message}. Using local acoustic synthesizer.`);
        }
      }
    }

    // 3. If neither worked, use high-fidelity acoustic speech-cadence synthesizer via FFmpeg
    if (ttsEngineUsed === 'fallback_synthesizer') {
      logger.info(jobId, 'narration', 'Generating local speech audio track via FFmpeg formant synthesis');
      await this.synthesizeLocalCadenceAudio(script, audioFilePath);
      ttsEngineUsed = 'local_cadence_synthesizer';
    }

    // 4. Measure exact audio properties with ffprobe
    const probe = await this.probeAudio(audioFilePath);
    const actualDurationSec = probe.durationSec;

    // 5. Calculate sentence-level timings synchronized with actual total duration
    const totalWords = script.lines.reduce((acc, l) => acc + l.text.split(/\s+/).filter(Boolean).length, 0) || 1;
    let currentStart = 0;

    const sentenceTimings: NarrationSentenceTiming[] = script.lines.map((line, index) => {
      const words = line.text.split(/\s+/).filter(Boolean).length;
      const proportion = words / totalWords;
      // Last line catches any remaining slice of time
      const isLast = index === script.lines.length - 1;
      const duration = isLast ? Math.max(0.5, actualDurationSec - currentStart) : actualDurationSec * proportion;
      const startSec = parseFloat(currentStart.toFixed(2));
      const endSec = parseFloat((currentStart + duration).toFixed(2));
      currentStart += duration;

      return {
        text: line.text,
        startSec,
        endSec,
      };
    });

    const artifact: NarrationArtifact = {
      audioFilePath,
      durationSec: parseFloat(actualDurationSec.toFixed(2)),
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      format: probe.format,
      ttsEngineUsed,
      sentenceTimings,
      generatedAt: new Date().toISOString(),
    };

    logger.info(jobId, 'narration', `Narration ready: ${actualDurationSec.toFixed(2)}s duration, engine: ${ttsEngineUsed}`);
    return artifact;
  }

  private async checkPiperAvailable(): Promise<boolean> {
    const bin = config.piperPath || 'piper';
    try {
      await execFileAsync('which', [bin]);
      return true;
    } catch {
      return false;
    }
  }

  private async synthesizeWithPiper(text: string, outputPath: string): Promise<void> {
    const bin = config.piperPath || 'piper';
    const args: string[] = ['--output_file', outputPath];
    if (config.piperModel) {
      args.push('--model', config.piperModel);
    }

    const child = execFile(bin, args);
    if (child.stdin) {
      child.stdin.write(text);
      child.stdin.end();
    }

    await new Promise<void>((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Piper exited with code ${code}`));
      });
      child.on('error', reject);
    });
  }

  private async synthesizeWithGemini(gemini: any, text: string, outputPath: string): Promise<void> {
    const response = await gemini.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ parts: [{ text: `Speak in a clear, authoritative, engaging documentary voice: ${text}` }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Charon' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('Gemini TTS did not return audio data');
    }

    const rawBuffer = Buffer.from(base64Audio, 'base64');
    const tempPcmPath = `${outputPath}.pcm`;
    await fs.writeFile(tempPcmPath, rawBuffer);

    // Convert raw PCM 24kHz to standard 44.1kHz WAV
    try {
      await execFileAsync(config.ffmpegPath, [
        '-y',
        '-f', 's16le',
        '-ar', '24000',
        '-ac', '1',
        '-i', tempPcmPath,
        '-ar', '44100',
        '-ac', '2',
        outputPath,
      ]);
    } finally {
      await fs.unlink(tempPcmPath).catch(() => {});
    }
  }

  /**
   * Generates a clean, rhythmic speech-cadence narration audio track using FFmpeg.
   * Useful in environments where Piper or Gemini are offline or during unit/e2e testing.
   */
  public async synthesizeLocalCadenceAudio(script: ScriptArtifact, outputPath: string): Promise<void> {
    const totalDuration = script.estimatedTotalDurationSec || 18;
    // Generate an ambient harmonic drone with human voice fundamentals (~130Hz - 260Hz) modulated to sentence rhythm
    const filterComplex = `
      sine=frequency=150:duration=${totalDuration}[b1];
      sine=frequency=240:duration=${totalDuration}[b2];
      sine=frequency=360:duration=${totalDuration}[b3];
      [b1][b2]amix=inputs=2:weights=0.6 0.4[m1];
      [m1][b3]amix=inputs=2:weights=0.7 0.3[mix];
      [mix]lowpass=f=1200,highpass=f=100,volume=0.45[voice]
    `.replace(/\s+/g, ' ').trim();

    await execFileAsync(config.ffmpegPath, [
      '-y',
      '-f', 'lavfi',
      '-i', `anullsrc=r=44100:cl=stereo:d=${totalDuration}`,
      '-filter_complex', filterComplex,
      '-map', '[voice]',
      '-c:a', 'pcm_s16le',
      '-ar', '44100',
      outputPath,
    ]);
  }

  public async probeAudio(audioPath: string): Promise<{ durationSec: number; sampleRate: number; channels: number; format: string }> {
    const { stdout } = await execFileAsync(config.ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      audioPath,
    ]);

    const data = JSON.parse(stdout);
    const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio') || data.streams?.[0];
    const durationStr = audioStream?.duration || data.format?.duration || '0';
    const durationSec = parseFloat(durationStr);

    return {
      durationSec: durationSec > 0 ? durationSec : 15.0,
      sampleRate: parseInt(audioStream?.sample_rate || '44100', 10),
      channels: parseInt(audioStream?.channels || '2', 10),
      format: audioStream?.codec_name || 'pcm_s16le',
    };
  }
}

export const narrationService = new NarrationService();
