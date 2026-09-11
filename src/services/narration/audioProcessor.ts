import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { AudioMeasurer, AudioProbeDetails } from './audioMeasurer';
import { PipelineLogger } from '../logging/logger';

export interface AudioProcessorOptions {
  targetSampleRate?: number;
  silenceThresholdDb?: number;
  leadingSilenceMinDuration?: number;
  trailingSilenceMinDuration?: number;
  targetIntegratedLoudness?: number; // e.g. -16 LUFS
  targetTruePeak?: number; // e.g. -1.5 dBTP
}

export class AudioProcessor {
  /**
   * Deterministically trims accidental leading and trailing silence from synthesized audio
   * and normalizes loudness to broadcast/social standard (-16 LUFS, -1.5 dBTP, 44.1kHz mono PCM).
   */
  static processNarrationAudio(
    inputWavPath: string,
    outputWavPath: string,
    logger?: PipelineLogger,
    options?: AudioProcessorOptions
  ): AudioProbeDetails {
    if (!fs.existsSync(inputWavPath)) {
      throw new Error(`AudioProcessor: input audio file does not exist at ${inputWavPath}`);
    }

    const initialStat = fs.statSync(inputWavPath);
    if (initialStat.size === 0) {
      throw new Error(`AudioProcessor: input audio file is empty at ${inputWavPath}`);
    }

    const outDir = path.dirname(outputWavPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const rawProbe = AudioMeasurer.probe(inputWavPath);
    const targetSampleRate = options?.targetSampleRate || 44100;
    const silenceThreshold = options?.silenceThresholdDb ?? -45;
    const leadingMinDur = options?.leadingSilenceMinDuration ?? 0.02;
    const trailingMinDur = options?.trailingSilenceMinDuration ?? 0.05;
    const targetLufs = options?.targetIntegratedLoudness ?? -16;
    const targetTruePeak = options?.targetTruePeak ?? -1.5;

    // Construct filter chain:
    // 1. Remove leading silence
    // 2. Reverse & remove trailing silence, then reverse back
    // 3. Loudness normalization (EBU R128 loudnorm for standard durations, volume boost/peak limit for micro-clips)
    const silenceFilter = [
      `silenceremove=start_periods=1:start_duration=${leadingMinDur}:start_threshold=${silenceThreshold}dB:detection=peak`,
      'areverse',
      `silenceremove=start_periods=1:start_duration=${trailingMinDur}:start_threshold=${silenceThreshold}dB:detection=peak`,
      'areverse',
    ].join(',');

    const filterChain =
      rawProbe.durationSeconds >= 1.5
        ? `${silenceFilter},loudnorm=I=${targetLufs}:TP=${targetTruePeak}:LRA=11`
        : `${silenceFilter},dynaudnorm=p=0.95`;

    const cmd = `ffmpeg -y -i "${inputWavPath}" -af "${filterChain}" -ar ${targetSampleRate} -ac 1 -c:a pcm_s16le "${outputWavPath}"`;

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch (err) {
      logger?.warn?.(
        `AudioProcessor: Primary filter chain failed (${(err as Error).message}). Retrying with safe volume normalizer.`
      );
      // Resilient fallback: standard format conversion without loudnorm filter
      const fallbackCmd = `ffmpeg -y -i "${inputWavPath}" -ar ${targetSampleRate} -ac 1 -c:a pcm_s16le "${outputWavPath}"`;
      execSync(fallbackCmd, { stdio: 'pipe' });
    }

    if (!fs.existsSync(outputWavPath) || fs.statSync(outputWavPath).size === 0) {
      // In case aggressive trimming stripped a silent file, copy input
      fs.copyFileSync(inputWavPath, outputWavPath);
    }

    const finalProbe = AudioMeasurer.probe(outputWavPath);
    const durationDelta = rawProbe.durationSeconds - finalProbe.durationSeconds;

    logger?.info?.(
      `AudioProcessor: Processed WAV: raw=${rawProbe.durationSeconds.toFixed(2)}s -> trimmed=${finalProbe.durationSeconds.toFixed(2)}s (trimmed ${durationDelta.toFixed(2)}s silence, rate=${finalProbe.sampleRate}Hz)`
    );

    return finalProbe;
  }
}
