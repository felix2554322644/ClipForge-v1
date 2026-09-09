import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../../config/index';

export class MotionApplier {
  static applyMotion(
    inputPath: string,
    outputPath: string,
    effect: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'static',
    durationSeconds: number,
    fps = CONFIG.TARGET_FPS,
    transition: 'cut' | 'fade' | 'crossfade' = 'cut',
    targetWidth = CONFIG.TARGET_WIDTH,
    targetHeight = CONFIG.TARGET_HEIGHT
  ): string {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found for motion application: ${inputPath}`);
    }

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
    let vf = '';

    switch (effect) {
      case 'zoom_in':
        vf = `zoompan=z='min(zoom+0.0015,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}`;
        break;
      case 'zoom_out':
        vf = `zoompan=z='if(lte(zoom,1.0),1.2,max(1.001,zoom-0.0015))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}`;
        break;
      case 'pan_left':
        vf = `zoompan=z=1.15:x='if(lte(on,1),(iw-iw/zoom)/2,max(0,x-1))':y='(ih-ih/zoom)/2':d=${totalFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}`;
        break;
      case 'pan_right':
        vf = `zoompan=z=1.15:x='if(lte(on,1),0,min(iw-iw/zoom,x+1))':y='(ih-ih/zoom)/2':d=${totalFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}`;
        break;
      case 'static':
      default:
        vf = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1`;
        break;
    }

    // Apply subtle fade in if requested
    if (transition === 'fade') {
      vf += `,fade=t=in:st=0:d=0.25`;
    }

    const cmd = `ffmpeg -y -i "${inputPath}" -vf "${vf}" -c:v libx264 -preset ultrafast -t ${durationSeconds} -an "${outputPath}"`;

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch {
      // Fallback to simple scale and trim
      const fallbackVf = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1`;
      execSync(
        `ffmpeg -y -i "${inputPath}" -vf "${fallbackVf}" -c:v libx264 -preset ultrafast -t ${durationSeconds} -an "${outputPath}"`,
        { stdio: 'pipe' }
      );
    }

    return outputPath;
  }
}
