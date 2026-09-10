import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../../config/index';

export interface MotionParameters {
  startScale: number;
  endScale: number;
  maxScale: number;
  panPercent: number;
  tiltPercent: number;
  isAnimated: boolean;
}

export class MotionApplier {
  /**
   * Returns safe, calibrated motion parameters for a given motion effect.
   * Ensures motion remains subtle, professional, and within safe intensity limits.
   */
  static getMotionParameters(
    effect: string = 'static',
    cropMode: string = 'standard',
    intensity: 'subtle' | 'moderate' | 'dramatic' = 'moderate'
  ): MotionParameters {
    const normalized = effect.toLowerCase().trim();

    // Scale intensity multipliers
    const zoomDelta = intensity === 'subtle' ? 0.04 : intensity === 'dramatic' ? 0.08 : 0.06;
    const panTravel = intensity === 'subtle' ? 0.40 : intensity === 'dramatic' ? 0.75 : 0.60;

    switch (normalized) {
      case 'push_in':
      case 'zoom_in':
        return {
          startScale: 1.0,
          endScale: 1.0 + zoomDelta,
          maxScale: 1.0 + zoomDelta,
          panPercent: 0,
          tiltPercent: 0,
          isAnimated: true,
        };

      case 'pull_out':
      case 'zoom_out':
        return {
          startScale: 1.0 + zoomDelta,
          endScale: 1.0,
          maxScale: 1.0 + zoomDelta,
          panPercent: 0,
          tiltPercent: 0,
          isAnimated: true,
        };

      case 'punch_in':
        return {
          startScale: 1.15,
          endScale: 1.18,
          maxScale: 1.18,
          panPercent: 0,
          tiltPercent: 0,
          isAnimated: true,
        };

      case 'pan_left':
      case 'pan_right':
        return {
          startScale: 1.08,
          endScale: 1.08,
          maxScale: 1.08,
          panPercent: panTravel,
          tiltPercent: 0,
          isAnimated: true,
        };

      case 'tilt_up':
      case 'tilt_down':
        return {
          startScale: 1.08,
          endScale: 1.08,
          maxScale: 1.08,
          panPercent: 0,
          tiltPercent: panTravel,
          isAnimated: true,
        };

      case 'static':
      default: {
        const scale = cropMode === 'punch_in' ? 1.15 : 1.0;
        return {
          startScale: scale,
          endScale: scale,
          maxScale: scale,
          panPercent: 0,
          tiltPercent: 0,
          isAnimated: false,
        };
      }
    }
  }

  /**
   * Constructs the FFmpeg filter graph string for smooth, continuous camera motion.
   * Replaces zoompan with per-frame scale and crop filters to prevent frame duplication, stutter, and jitter.
   * Ensures output is locked to target FPS with setsar=1.
   */
  static buildMotionFilter(
    effect: string = 'static',
    durationSeconds: number = 2.0,
    fps: number = CONFIG.TARGET_FPS,
    targetWidth: number = CONFIG.TARGET_WIDTH,
    targetHeight: number = CONFIG.TARGET_HEIGHT,
    cropMode: string = 'standard',
    transition: string = 'cut',
    intensity: 'subtle' | 'moderate' | 'dramatic' = 'moderate'
  ): string {
    const d = Math.max(0.1, durationSeconds);
    const normalized = effect.toLowerCase().trim();
    const params = this.getMotionParameters(normalized, cropMode, intensity);
    let vf = '';

    switch (normalized) {
      case 'push_in':
      case 'zoom_in': {
        const delta = (params.endScale - params.startScale).toFixed(4);
        vf = `scale=w='trunc(${targetWidth}*(${params.startScale}+${delta}*min(t/${d},1))/2)*2':h='trunc(${targetHeight}*(${params.startScale}+${delta}*min(t/${d},1))/2)*2':eval=frame:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2:exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'pull_out':
      case 'zoom_out': {
        const delta = (params.startScale - params.endScale).toFixed(4);
        vf = `scale=w='trunc(${targetWidth}*(${params.startScale}-${delta}*min(t/${d},1))/2)*2':h='trunc(${targetHeight}*(${params.startScale}-${delta}*min(t/${d},1))/2)*2':eval=frame:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2:exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'punch_in': {
        const delta = (params.endScale - params.startScale).toFixed(4);
        vf = `scale=w='trunc(${targetWidth}*(${params.startScale}+${delta}*min(t/${d},1))/2)*2':h='trunc(${targetHeight}*(${params.startScale}+${delta}*min(t/${d},1))/2)*2':eval=frame:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2:exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'pan_left': {
        const scaleW = Math.round((targetWidth * params.startScale) / 2) * 2;
        const scaleH = Math.round((targetHeight * params.startScale) / 2) * 2;
        const startX = 0.5 + params.panPercent / 2;
        const travel = params.panPercent.toFixed(2);
        vf = `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:x='(in_w-out_w)*(${startX.toFixed(2)}-${travel}*min(t/${d},1))':y='(in_h-out_h)/2':exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'pan_right': {
        const scaleW = Math.round((targetWidth * params.startScale) / 2) * 2;
        const scaleH = Math.round((targetHeight * params.startScale) / 2) * 2;
        const startX = 0.5 - params.panPercent / 2;
        const travel = params.panPercent.toFixed(2);
        vf = `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:x='(in_w-out_w)*(${startX.toFixed(2)}+${travel}*min(t/${d},1))':y='(in_h-out_h)/2':exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'tilt_up': {
        const scaleW = Math.round((targetWidth * params.startScale) / 2) * 2;
        const scaleH = Math.round((targetHeight * params.startScale) / 2) * 2;
        const startY = 0.5 + params.tiltPercent / 2;
        const travel = params.tiltPercent.toFixed(2);
        vf = `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:x='(in_w-out_w)/2':y='(in_h-out_h)*(${startY.toFixed(2)}-${travel}*min(t/${d},1))':exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'tilt_down': {
        const scaleW = Math.round((targetWidth * params.startScale) / 2) * 2;
        const scaleH = Math.round((targetHeight * params.startScale) / 2) * 2;
        const startY = 0.5 - params.tiltPercent / 2;
        const travel = params.tiltPercent.toFixed(2);
        vf = `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:x='(in_w-out_w)/2':y='(in_h-out_h)*(${startY.toFixed(2)}+${travel}*min(t/${d},1))':exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'static':
      default: {
        if (cropMode === 'punch_in') {
          const punchW = Math.round((targetWidth * 1.15) / 2) * 2;
          const punchH = Math.round((targetHeight * 1.15) / 2) * 2;
          vf = `scale=${punchW}:${punchH}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2,setsar=1,fps=${fps}`;
        } else {
          vf = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2,setsar=1,fps=${fps}`;
        }
        break;
      }
    }

    // Apply editorial transitions cleanly
    if (transition === 'fade') {
      vf += `,fade=t=in:st=0:d=0.20`;
    } else if (transition === 'flash') {
      vf += `,fade=t=in:st=0:d=0.15:color=white`;
    } else if (transition === 'crossfade') {
      vf += `,fade=t=in:st=0:d=0.25`;
    }

    return vf;
  }

  static applyMotion(
    inputPath: string,
    outputPath: string,
    effect: string = 'static',
    durationSeconds: number = 2.0,
    fps: number = CONFIG.TARGET_FPS,
    transition: string = 'cut',
    targetWidth: number = CONFIG.TARGET_WIDTH,
    targetHeight: number = CONFIG.TARGET_HEIGHT,
    inPoint: number = 0,
    cropMode: string = 'standard',
    intensity: 'subtle' | 'moderate' | 'dramatic' = 'moderate'
  ): string {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found for motion application: ${inputPath}`);
    }

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const vf = this.buildMotionFilter(
      effect,
      durationSeconds,
      fps,
      targetWidth,
      targetHeight,
      cropMode,
      transition,
      intensity
    );

    // Respect inPoint seek to use selected portion of source video
    const safeInPoint = Math.max(0, inPoint);
    const ssArg = safeInPoint > 0.05 ? `-ss ${safeInPoint.toFixed(3)}` : '';
    const cmd = `ffmpeg -y ${ssArg} -i "${inputPath}" -vf "${vf}" -c:v libx264 -preset ultrafast -t ${durationSeconds.toFixed(3)} -r ${fps} -an "${outputPath}"`;

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch {
      // Robust fallback to clean scale, crop, and fps normalization
      const fallbackVf = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2,setsar=1,fps=${fps}`;
      execSync(
        `ffmpeg -y ${ssArg} -i "${inputPath}" -vf "${fallbackVf}" -c:v libx264 -preset ultrafast -t ${durationSeconds.toFixed(3)} -r ${fps} -an "${outputPath}"`,
        { stdio: 'pipe' }
      );
    }

    return outputPath;
  }
}
