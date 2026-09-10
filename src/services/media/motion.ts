import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../../config/index';

export class MotionApplier {
  static applyMotion(
    inputPath: string,
    outputPath: string,
    effect: string = 'static',
    durationSeconds: number = 2.0,
    fps = CONFIG.TARGET_FPS,
    transition: string = 'cut',
    targetWidth = CONFIG.TARGET_WIDTH,
    targetHeight = CONFIG.TARGET_HEIGHT,
    inPoint = 0
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
      case 'push_in':
      case 'zoom_in':
        vf = `zoompan=z='min(zoom+0.0012,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}`;
        break;

      case 'punch_in':
        // Instant tight framing with subtle forward push for high-impact emphasis
        vf = `zoompan=z='min(1.22+0.0006*on,1.30)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}`;
        break;

      case 'pull_out':
      case 'zoom_out':
        vf = `zoompan=z='if(lte(zoom,1.0),1.14,max(1.001,zoom-0.0012))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}`;
        break;

      case 'pan_left':
        vf = `zoompan=z=1.12:x='if(lte(on,1),(iw-iw/zoom)*0.75,max(0,x-1))':y='(ih-ih/zoom)/2':d=${totalFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}`;
        break;

      case 'pan_right':
        vf = `zoompan=z=1.12:x='if(lte(on,1),(iw-iw/zoom)*0.25,min(iw-iw/zoom,x+1))':y='(ih-ih/zoom)/2':d=${totalFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}`;
        break;

      case 'tilt_up':
        vf = `zoompan=z=1.12:x='(iw-iw/zoom)/2':y='if(lte(on,1),(ih-ih/zoom)*0.75,max(0,y-1))':d=${totalFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}`;
        break;

      case 'tilt_down':
        vf = `zoompan=z=1.12:x='(iw-iw/zoom)/2':y='if(lte(on,1),(ih-ih/zoom)*0.25,min(ih-ih/zoom,y+1))':d=${totalFrames}:s=${targetWidth}x${targetHeight}:fps=${fps}`;
        break;

      case 'static':
      default:
        vf = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1`;
        break;
    }

    // Apply editorial transitions
    if (transition === 'fade') {
      vf += `,fade=t=in:st=0:d=0.20`;
    } else if (transition === 'flash') {
      vf += `,fade=t=in:st=0:d=0.15:color=white`;
    } else if (transition === 'crossfade') {
      vf += `,fade=t=in:st=0:d=0.25`;
    }

    // Respect inPoint seek to use selected portion of source video
    const safeInPoint = Math.max(0, inPoint);
    const ssArg = safeInPoint > 0.05 ? `-ss ${safeInPoint.toFixed(3)}` : '';
    const cmd = `ffmpeg -y ${ssArg} -i "${inputPath}" -vf "${vf}" -c:v libx264 -preset ultrafast -t ${durationSeconds.toFixed(3)} -an "${outputPath}"`;

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch {
      // Robust fallback to clean scale and trim
      const fallbackVf = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1`;
      execSync(
        `ffmpeg -y ${ssArg} -i "${inputPath}" -vf "${fallbackVf}" -c:v libx264 -preset ultrafast -t ${durationSeconds.toFixed(3)} -an "${outputPath}"`,
        { stdio: 'pipe' }
      );
    }

    return outputPath;
  }
}
