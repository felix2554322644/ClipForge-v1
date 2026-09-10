import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../../config/index';

export class VideoReframer {
  static reframeToPortrait(
    inputVideoPath: string,
    outputVideoPath: string,
    targetWidth = CONFIG.TARGET_WIDTH,
    targetHeight = CONFIG.TARGET_HEIGHT
  ): string {
    if (!fs.existsSync(inputVideoPath)) {
      throw new Error(`Input video not found for reframing: ${inputVideoPath}`);
    }

    const outDir = path.dirname(outputVideoPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Scale to fill target dimensions while maintaining aspect ratio, then crop center
    // scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920
    const filter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1,fps=${CONFIG.TARGET_FPS}`;

    const cmd = `ffmpeg -y -i "${inputVideoPath}" -vf "${filter}" -c:v libx264 -preset ultrafast -crf 23 -r ${CONFIG.TARGET_FPS} -an "${outputVideoPath}"`;

    execSync(cmd, { stdio: 'pipe' });

    if (!fs.existsSync(outputVideoPath) || fs.statSync(outputVideoPath).size === 0) {
      throw new Error(`Reframing failed to create output video at: ${outputVideoPath}`);
    }

    return outputVideoPath;
  }
}
