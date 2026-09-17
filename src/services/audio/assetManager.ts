import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CONFIG } from '../../config/index';
import { PipelineLogger } from '../logging/logger';
import { MusicGenreMood, AudioCueType } from '../../types/audio';

export class AudioAssetManager {
  private static cacheDir = path.join(CONFIG.CACHE_DIR, 'audio');

  /**
   * Returns path to cached or rendered production music bed.
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

    this.renderMusicBed(mood, targetPath, durationSeconds, logger);
    return targetPath;
  }

  /**
   * Returns path to cached or rendered SFX cue.
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

    this.renderSfx(type, targetPath, durationSeconds, logger);
    return targetPath;
  }

  private static renderMusicBed(
    mood: MusicGenreMood,
    outputPath: string,
    duration: number,
    logger?: PipelineLogger
  ): void {
    logger?.info?.(`AudioAssetManager: Rendering music bed (${mood}, ${duration.toFixed(1)}s)`);

    let lavfiCmd = '';
    switch (mood) {
      case 'tense_investigative':
        lavfiCmd = `ffmpeg -y -f lavfi -i "sine=frequency=110:duration=${duration}" -f lavfi -i "sine=frequency=146.83:duration=${duration}" -f lavfi -i "anoisesrc=duration=${duration}:color=pink:amplitude=0.02" -filter_complex "[0:a][1:a][2:a]amix=inputs=3:duration=first,lowpass=f=450,volume=0.25" -ar 44100 -ac 2 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'dark_pulsing':
        lavfiCmd = `ffmpeg -y -f lavfi -i "sine=frequency=65.41:duration=${duration}" -f lavfi -i "sine=frequency=98.0:duration=${duration}" -f lavfi -i "anoisesrc=duration=${duration}:color=brown:amplitude=0.025" -filter_complex "[0:a][1:a][2:a]amix=inputs=3:duration=first,lowpass=f=350,volume=0.3" -ar 44100 -ac 2 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'uplifting_build':
        lavfiCmd = `ffmpeg -y -f lavfi -i "sine=frequency=130.81:duration=${duration}" -f lavfi -i "sine=frequency=196.0:duration=${duration}" -f lavfi -i "sine=frequency=261.63:duration=${duration}" -filter_complex "[0:a][1:a][2:a]amix=inputs=3:duration=first,lowpass=f=600,volume=0.22" -ar 44100 -ac 2 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'cosmic_synth':
      case 'cinematic_ambient':
      default:
        lavfiCmd = `ffmpeg -y -f lavfi -i "sine=frequency=110:duration=${duration}" -f lavfi -i "sine=frequency=164.81:duration=${duration}" -f lavfi -i "anoisesrc=duration=${duration}:color=brown:amplitude=0.02" -filter_complex "[0:a][1:a][2:a]amix=inputs=3:duration=first,lowpass=f=400,volume=0.25" -ar 44100 -ac 2 -c:a pcm_s16le "${outputPath}"`;
        break;
    }

    try {
      execSync(lavfiCmd, { stdio: 'pipe' });
    } catch (err) {
      logger?.warn?.(`AudioAssetManager: Music bed rendering failed: ${(err as Error).message}`);
    }
  }

  private static renderSfx(
    type: AudioCueType,
    outputPath: string,
    duration: number,
    logger?: PipelineLogger
  ): void {
    const sfxDuration = Math.min(0.6, Math.max(0.2, duration));
    let cmd = '';

    switch (type) {
      case 'whoosh':
        cmd = `ffmpeg -y -f lavfi -i "anoisesrc=duration=${sfxDuration}:color=pink:amplitude=0.08" -filter_complex "highpass=f=300,lowpass=f=3000,afade=t=in:st=0:d=0.1,afade=t=out:st=${(sfxDuration - 0.1).toFixed(2)}:d=0.1,volume=0.35" -ar 44100 -ac 2 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'impact':
        cmd = `ffmpeg -y -f lavfi -i "sine=frequency=80:duration=${sfxDuration}" -f lavfi -i "anoisesrc=duration=${sfxDuration}:color=brown:amplitude=0.1" -filter_complex "[0:a][1:a]amix=inputs=2:duration=first,lowpass=f=250,afade=t=out:st=0.05:d=${(sfxDuration - 0.05).toFixed(2)},volume=0.4" -ar 44100 -ac 2 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'riser':
        cmd = `ffmpeg -y -f lavfi -i "anoisesrc=duration=${sfxDuration}:color=pink:amplitude=0.06" -filter_complex "highpass=f=200,lowpass=f=4000,afade=t=in:st=0:d=${sfxDuration.toFixed(2)},volume=0.3" -ar 44100 -ac 2 -c:a pcm_s16le "${outputPath}"`;
        break;
      case 'pop':
      case 'chime':
      case 'glitch':
      case 'sub_drop':
      default:
        cmd = `ffmpeg -y -f lavfi -i "sine=frequency=50:duration=${sfxDuration}" -filter_complex "lowpass=f=120,afade=t=out:st=0.1:d=${(sfxDuration - 0.1).toFixed(2)},volume=0.45" -ar 44100 -ac 2 -c:a pcm_s16le "${outputPath}"`;
        break;
    }

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch (err) {
      logger?.warn?.(`AudioAssetManager: SFX synthesis failed: ${(err as Error).message}`);
    }
  }
}
