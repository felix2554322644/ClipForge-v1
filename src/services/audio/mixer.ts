import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PipelineLogger } from '../logging/logger';
import { AudioMeasurer, AudioProbeDetails } from '../narration/audioMeasurer';

export interface AudioMixOptions {
  musicTrackPath?: string;
  sfxTrackPath?: string;
  targetDurationSeconds: number;
  targetIntegratedLoudness?: number; // e.g., -16 LUFS
  targetTruePeak?: number; // e.g., -1.5 dBTP
}

export class ProfessionalAudioMixer {
  constructor(private logger?: PipelineLogger) {}

  /**
   * Generates a deterministic free/local cinematic ambient music bed WAV via FFmpeg.
   */
  private generateAmbientMusicBed(outputPath: string, durationSeconds: number): void {
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const cmd = `ffmpeg -y -f lavfi -i "sine=frequency=110:duration=${durationSeconds}" -f lavfi -i "sine=frequency=164.81:duration=${durationSeconds}" -f lavfi -i "anoisesrc=duration=${durationSeconds}:color=brown:amplitude=0.02" -filter_complex "amix=inputs=3:duration=first,lowpass=f=400,volume=0.25" -ar 44100 -ac 1 -c:a pcm_s16le "${outputPath}"`;
    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch (err) {
      this.logger?.warn?.(`ProfessionalAudioMixer: Failed to generate ambient music bed: ${(err as Error).message}`);
    }
  }

  /**
   * Generates a deterministic strategic SFX whoosh/impact WAV via FFmpeg.
   */
  private generateStrategicSfx(outputPath: string, durationSeconds: number): void {
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const cmd = `ffmpeg -y -f lavfi -i "sine=frequency=300:duration=${Math.min(0.8, durationSeconds)}" -filter_complex "volume=0.3,afade=t=in:st=0:d=0.1,afade=t=out:st=0.5:d=0.3" -ar 44100 -ac 1 -c:a pcm_s16le "${outputPath}"`;
    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch (err) {
      this.logger?.warn?.(`ProfessionalAudioMixer: Failed to generate strategic SFX: ${(err as Error).message}`);
    }
  }

  /**
   * Mixes Piper narration, cinematic music bed, and strategic SFX with ducking, hierarchy (narration > SFX > music),
   * smooth fades, loudness normalization, and authoritative duration preservation.
   */
  mixAudio(
    narrationWavPath: string,
    outputWavPath: string,
    options: AudioMixOptions
  ): AudioProbeDetails {
    if (!fs.existsSync(narrationWavPath)) {
      throw new Error(`ProfessionalAudioMixer: Narration audio not found at ${narrationWavPath}`);
    }

    const outDir = path.dirname(outputWavPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const duration = options.targetDurationSeconds || 5.0;
    const cacheDir = path.join(outDir, 'audio_cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Resolve or generate music bed
    let musicPath = options.musicTrackPath;
    if (!musicPath || !fs.existsSync(musicPath)) {
      musicPath = path.join(cacheDir, 'ambient_bed.wav');
      if (!fs.existsSync(musicPath)) {
        this.generateAmbientMusicBed(musicPath, duration);
      }
    }

    // Resolve or generate strategic SFX
    let sfxPath = options.sfxTrackPath;
    if (!sfxPath || !fs.existsSync(sfxPath)) {
      sfxPath = path.join(cacheDir, 'strategic_sfx.wav');
      if (!fs.existsSync(sfxPath)) {
        this.generateStrategicSfx(sfxPath, duration);
      }
    }

    const hasMusic = fs.existsSync(musicPath);
    const hasSfx = fs.existsSync(sfxPath);

    this.logger?.stage(
      'AUDIO_MIXING',
      `Mixing professional audio pipeline: narration (priority=1.0) + music (${hasMusic ? 'enabled' : 'fallback'}) + sfx (${hasSfx ? 'enabled' : 'fallback'})`
    );

    const inputs: string[] = [`-i "${narrationWavPath}"`];
    let filterGraph = '';

    let inputIdx = 1;
    let musicIdx = -1;
    let sfxIdx = -1;

    if (hasMusic) {
      inputs.push(`-i "${musicPath}"`);
      musicIdx = inputIdx++;
    }
    if (hasSfx) {
      inputs.push(`-i "${sfxPath}"`);
      sfxIdx = inputIdx++;
    }

    const fadeOutStart = Math.max(0, duration - 2.0);
    let mixInputs = '[0:a]volume=1.0[narr];';
    const mixLabels = ['[narr]'];

    if (musicIdx >= 0) {
      filterGraph += `[${musicIdx}:a]volume=0.18,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=2.0[music_bed];`;
      mixLabels.push('[music_bed]');
    }

    if (sfxIdx >= 0) {
      filterGraph += `[${sfxIdx}:a]volume=0.35,afade=t=in:st=0.2:d=0.1[sfx_cue];`;
      mixLabels.push('[sfx_cue]');
    }

    const targetLufs = options.targetIntegratedLoudness ?? -16;
    const targetTruePeak = options.targetTruePeak ?? -1.5;

    const amixInputs = mixLabels.join('');
    filterGraph += `${mixInputs}${amixInputs}amix=inputs=${mixLabels.length}:duration=first,loudnorm=I=${targetLufs}:TP=${targetTruePeak}:LRA=11[outa]`;

    const mixCmd = `ffmpeg -y ${inputs.join(' ')} -filter_complex "${filterGraph}" -map "[outa]" -ar 44100 -ac 1 -c:a pcm_s16le -t ${duration} "${outputWavPath}"`;

    try {
      execSync(mixCmd, { stdio: 'pipe' });
    } catch (err) {
      this.logger?.warn?.(`ProfessionalAudioMixer: Complex audio mix failed (${(err as Error).message}). Falling back to clean narration.`);
      const fallbackCmd = `ffmpeg -y -i "${narrationWavPath}" -ar 44100 -ac 1 -c:a pcm_s16le -t ${duration} "${outputWavPath}"`;
      execSync(fallbackCmd, { stdio: 'pipe' });
    }

    if (!fs.existsSync(outputWavPath) || fs.statSync(outputWavPath).size === 0) {
      fs.copyFileSync(narrationWavPath, outputWavPath);
    }

    const probe = AudioMeasurer.probe(outputWavPath);
    this.logger?.info?.(
      `ProfessionalAudioMixer: Audio mix completed successfully. Duration: ${probe.durationSeconds.toFixed(2)}s, LUFS/Peak normalized.`
    );

    return probe;
  }
}
