import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CONFIG } from '../../config/index';
import { PipelineLogger } from '../logging/logger';

export interface AmbienceTrack {
  tag: string;
  name: string;
  category: 'nature' | 'urban' | 'space' | 'interior' | 'suspense';
  defaultVolume: number;
}

export const AMBIENCE_TRACKS: Record<string, AmbienceTrack> = {
  rain: { tag: 'rain', name: 'Gentle Rainfall & Distant Thunder', category: 'nature', defaultVolume: 0.18 },
  wind: { tag: 'wind', name: 'High Altitude Wind & Atmosphere', category: 'nature', defaultVolume: 0.15 },
  city: { tag: 'city', name: 'Subdued Urban City Rumble', category: 'urban', defaultVolume: 0.14 },
  drone: { tag: 'drone', name: 'Deep Cinematic Sub Drone', category: 'space', defaultVolume: 0.20 },
  space: { tag: 'space', name: 'Ethereal Cosmic Void Atmosphere', category: 'space', defaultVolume: 0.18 },
  clock: { tag: 'clock', name: 'Subtle Mechanical Clock Ticking', category: 'suspense', defaultVolume: 0.16 },
  room_tone: { tag: 'room_tone', name: 'Acoustic Room Tone & Air', category: 'interior', defaultVolume: 0.12 },
};

export class AmbienceLibraryService {
  private static cacheDir = path.join(CONFIG.CACHE_DIR, 'audio', 'ambience');

  /**
   * Resolves or generates high-quality layered ambient track for emotional scene anchoring.
   */
  static getAmbienceTrack(
    tag: string,
    durationSeconds: number,
    logger?: PipelineLogger
  ): { path: string; track: AmbienceTrack } {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    const matchedTag = Object.keys(AMBIENCE_TRACKS).find((k) =>
      tag.toLowerCase().includes(k)
    ) || 'room_tone';

    const track = AMBIENCE_TRACKS[matchedTag];
    const filename = `ambience_${matchedTag}_${Math.ceil(durationSeconds)}s.wav`;
    const targetPath = path.join(this.cacheDir, filename);

    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000) {
      return { path: targetPath, track };
    }

    this.renderAmbienceLoop(matchedTag, targetPath, durationSeconds, logger);
    return { path: targetPath, track };
  }

  private static renderAmbienceLoop(
    tag: string,
    outputPath: string,
    duration: number,
    logger?: PipelineLogger
  ): void {
    logger?.info?.(`AmbienceLibrary: Rendering ambient loop [${tag}] (${duration.toFixed(1)}s)`);

    // High quality filtered acoustic ambient textures
    let filter = '';
    switch (tag) {
      case 'rain':
        filter = `anoisesrc=duration=${duration}:color=pink:amplitude=0.035,lowpass=f=2800,highpass=f=220,volume=0.25`;
        break;
      case 'wind':
        filter = `anoisesrc=duration=${duration}:color=brown:amplitude=0.04,lowpass=f=750,highpass=f=80,volume=0.22`;
        break;
      case 'city':
        filter = `anoisesrc=duration=${duration}:color=brown:amplitude=0.03,lowpass=f=450,highpass=f=60,volume=0.20`;
        break;
      case 'space':
      case 'drone':
        filter = `sine=frequency=55:duration=${duration},lowpass=f=250,volume=0.28`;
        break;
      case 'clock':
        filter = `anoisesrc=duration=${duration}:color=white:amplitude=0.02,lowpass=f=1200,volume=0.18`;
        break;
      case 'room_tone':
      default:
        filter = `anoisesrc=duration=${duration}:color=brown:amplitude=0.015,lowpass=f=350,highpass=f=50,volume=0.15`;
        break;
    }

    const cmd = `ffmpeg -y -f lavfi -i "${filter}" -ar 44100 -ac 2 -c:a pcm_s16le "${outputPath}"`;
    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch (err) {
      logger?.warn?.(`AmbienceLibrary: Failed to render loop (${(err as Error).message})`);
    }
  }
}
