import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CONFIG } from '../../config/index';
import { PipelineLogger } from '../logging/logger';
import { MusicGenreMood, AudioCueType } from '../../types/audio';

export class AudioAssetManager {
  private static cacheDir = path.join(CONFIG.CACHE_DIR, 'audio');

  /**
   * Returns path to cached or procedurally synthesized music bed.
   */
  static getMusicBed(mood: MusicGenreMood, durationSeconds: number, logger?: PipelineLogger): string {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    const filename = `music_${mood}_${Math.ceil(durationSeconds)}s.wav`;
    const targetPath = path.join(this.cacheDir, filename);

    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000) {
      return targetPath;
    }

    this.generateProceduralMusic(mood, targetPath, durationSeconds, logger);
    return targetPath;
  }

  /**
   * Returns path to cached or procedurally synthesized SFX cue.
   */
  static getSfx(type: AudioCueType, durationSeconds = 0.5, logger?: PipelineLogger): string {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    const filename = `sfx_${type}.wav`;
    const targetPath = path.join(this.cacheDir, filename);

    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000) {
      return targetPath;
    }

    this.generateProceduralSfx(type, targetPath, durationSeconds, logger);
    return targetPath;
  }

  /**
   * Procedural synthesizer for background music beds using FFmpeg lavfi filters.
   */
  private static generateProceduralMusic(
    mood: MusicGenreMood,
    outputPath: string,
    duration: number,
    logger?: PipelineLogger
  ): void {
    logger?.info(`AudioAssetManager: Synthesizing procedural music bed (${mood}, ${duration.toFixed(1)}s)`);

    let lavfiCmd = '';
    switch (mood) {
      case 'cosmic_synth':
        lavfiCmd = `ffmpeg -y -f lavfi -i "sine=frequency=92.5:duration=${duration}" -f lavfi -i "sine=frequency=138.59:duration=${duration}" -f lavfi -i "sine=frequency=277.18:duration=${duration}" -f lavfi -i "anoisesrc=duration=${duration}:color=pink:amplitude=0.015" -filter_complex "[0:a][1:a][2:a][3:a]amix=inputs=4:duration=first,lowpass=f=550,volume=0.25" -ar 44100 -ac 1 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'dark_pulsing':
        lavfiCmd = `ffmpeg -y -f lavfi -i "sine=frequency=65.41:duration=${duration}" -f lavfi -i "sine=frequency=98.0:duration=${duration}" -f lavfi -i "anoisesrc=duration=${duration}:color=brown:amplitude=0.025" -filter_complex "[0:a][1:a][2:a]amix=inputs=3:duration=first,lowpass=f=350,volume=0.3" -ar 44100 -ac 1 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'tense_investigative':
        lavfiCmd = `ffmpeg -y -f lavfi -i "sine=frequency=110:duration=${duration}" -f lavfi -i "sine=frequency=146.83:duration=${duration}" -f lavfi -i "anoisesrc=duration=${duration}:color=pink:amplitude=0.02" -filter_complex "[0:a][1:a][2:a]amix=inputs=3:duration=first,lowpass=f=450,volume=0.25" -ar 44100 -ac 1 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'uplifting_build':
        lavfiCmd = `ffmpeg -y -f lavfi -i "sine=frequency=130.81:duration=${duration}" -f lavfi -i "sine=frequency=196.0:duration=${duration}" -f lavfi -i "sine=frequency=261.63:duration=${duration}" -filter_complex "[0:a][1:a][2:a]amix=inputs=3:duration=first,lowpass=f=600,volume=0.22" -ar 44100 -ac 1 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'cinematic_ambient':
      default:
        lavfiCmd = `ffmpeg -y -f lavfi -i "sine=frequency=110:duration=${duration}" -f lavfi -i "sine=frequency=164.81:duration=${duration}" -f lavfi -i "anoisesrc=duration=${duration}:color=brown:amplitude=0.02" -filter_complex "[0:a][1:a][2:a]amix=inputs=3:duration=first,lowpass=f=400,volume=0.25" -ar 44100 -ac 1 -c:a pcm_s16le "${outputPath}"`;
        break;
    }

    try {
      execSync(lavfiCmd, { stdio: 'pipe' });
    } catch (err) {
      logger?.warn(`AudioAssetManager: Procedural music synthesis failed: ${(err as Error).message}`);
    }
  }

  /**
   * Procedural synthesizer for strategic SFX cues.
   */
  private static generateProceduralSfx(
    type: AudioCueType,
    outputPath: string,
    duration: number,
    logger?: PipelineLogger
  ): void {
    const sfxDuration = Math.min(0.6, Math.max(0.2, duration));
    let cmd = '';

    switch (type) {
      case 'whoosh':
        cmd = `ffmpeg -y -f lavfi -i "anoisesrc=duration=${sfxDuration}:color=pink:amplitude=0.15" -filter_complex "lowpass=f=800,volume=0.4,afade=t=in:st=0:d=0.12,afade=t=out:st=0.25:d=0.2" -ar 44100 -ac 1 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'impact':
      case 'sub_drop':
        cmd = `ffmpeg -y -f lavfi -i "sine=frequency=90:duration=${sfxDuration}" -filter_complex "lowpass=f=200,volume=0.45,afade=t=in:st=0:d=0.05,afade=t=out:st=0.15:d=0.3" -ar 44100 -ac 1 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'pop':
      case 'chime':
        cmd = `ffmpeg -y -f lavfi -i "sine=frequency=600:duration=${sfxDuration}" -filter_complex "volume=0.3,afade=t=in:st=0:d=0.02,afade=t=out:st=0.08:d=0.15" -ar 44100 -ac 1 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'glitch':
      case 'riser':
      default:
        cmd = `ffmpeg -y -f lavfi -i "sine=frequency=320:duration=${sfxDuration}" -filter_complex "volume=0.3,afade=t=in:st=0:d=0.05,afade=t=out:st=0.15:d=0.2" -ar 44100 -ac 1 -c:a pcm_s16le "${outputPath}"`;
        break;
    }

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch (err) {
      logger?.warn(`AudioAssetManager: Procedural SFX synthesis failed: ${(err as Error).message}`);
    }
  }
}
