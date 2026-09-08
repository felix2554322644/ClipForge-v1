import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NarrationArtifact, NarrationSentenceTiming, ScriptArtifact } from '../../types/pipeline.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

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

    const piperCheck = await this.checkPiperAvailable();
    if (!piperCheck.ok) {
      throw new Error(
        `CRITICAL: Piper local TTS is required for video generation. ${piperCheck.error}. Faking narration or replacing Piper with a cloud TTS service is forbidden.`
      );
    }

    try {
      logger.info(jobId, 'narration', `Using Piper local TTS (${config.piperPath}) with model (${path.basename(config.piperModel)})`);
      await this.synthesizeWithPiper(script.fullNarrationText, audioFilePath);
    } catch (err: any) {
      throw new Error(`CRITICAL: Piper synthesis failed: ${err.message || err}. Faking narration is strictly forbidden.`);
    }

    const ttsEngineUsed = 'piper_local';

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

  private async checkPiperAvailable(): Promise<{ ok: boolean; error?: string }> {
    const bin = config.piperPath;
    const model = config.piperModel;

    // Check executable
    try {
      const { stdout, stderr } = await execFileAsync(bin, ['--version']);
      if (!stdout && !stderr) {
        return { ok: false, error: `Piper binary at ${bin} returned no version output` };
      }
    } catch (err: any) {
      return { ok: false, error: `Piper binary at ${bin} cannot be executed (${err.message || err})` };
    }

    // Check model
    try {
      if (!fsSync.existsSync(model)) {
        return { ok: false, error: `Piper voice model not found at ${model}` };
      }
      fsSync.accessSync(model, fsSync.constants.R_OK);
      const stat = fsSync.statSync(model);
      if (stat.size < 10 * 1024 * 1024) {
        return { ok: false, error: `Piper voice model file is too small or corrupted (${stat.size} bytes)` };
      }
    } catch (err: any) {
      return { ok: false, error: `Piper voice model at ${model} is not readable (${err.message || err})` };
    }

    return { ok: true };
  }

  private async synthesizeWithPiper(text: string, outputPath: string): Promise<void> {
    const bin = config.piperPath;
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
        if (code === 0 && fsSync.existsSync(outputPath) && fsSync.statSync(outputPath).size > 100) {
          resolve();
        } else {
          reject(new Error(`Piper exited with code ${code} or failed to generate non-empty audio`));
        }
      });
      child.on('error', reject);
    });
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
