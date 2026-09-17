import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../../config/index';
import { BRAND_BIBLE } from '../../config/brandBible';

export interface MotionParameters {
  startScale: number;
  endScale: number;
  maxScale: number;
  panPercent: number;
  tiltPercent: number;
  isAnimated: boolean;
  speedMultiplier: number;
}

export class MotionApplier {
  /**
   * Returns safe, calibrated motion parameters with narrative-tied ease curves.
   */
  static getMotionParameters(
    effect: string = 'static',
    cropMode: string = 'standard',
    intensity: 'subtle' | 'moderate' | 'dramatic' = 'moderate'
  ): MotionParameters {
    const normalized = effect.toLowerCase().trim();

    // Base scale adjustment based on cropMode
    const baseScale =
      cropMode === 'punch_in'
        ? 1.15
        : cropMode === 'tight'
        ? 1.22
        : 1.0;

    // Scale intensity multipliers
    const zoomDelta = intensity === 'subtle' ? 0.04 : intensity === 'dramatic' ? 0.08 : 0.06;
    const panTravel = intensity === 'subtle' ? 0.35 : intensity === 'dramatic' ? 0.70 : 0.50;

    switch (normalized) {
      case 'push_in':
      case 'zoom_in':
        return {
          startScale: baseScale,
          endScale: baseScale + zoomDelta,
          maxScale: baseScale + zoomDelta,
          panPercent: 0,
          tiltPercent: 0,
          isAnimated: true,
          speedMultiplier: 1.0,
        };

      case 'pull_out':
      case 'zoom_out':
        return {
          startScale: baseScale + zoomDelta,
          endScale: baseScale,
          maxScale: baseScale + zoomDelta,
          panPercent: 0,
          tiltPercent: 0,
          isAnimated: true,
          speedMultiplier: 1.0,
        };

      case 'punch_in':
        return {
          startScale: Math.max(1.15, baseScale),
          endScale: Math.max(1.15, baseScale) + 0.04,
          maxScale: Math.max(1.15, baseScale) + 0.04,
          panPercent: 0,
          tiltPercent: 0,
          isAnimated: true,
          speedMultiplier: 1.0,
        };

      case 'pan_left':
      case 'pan_right':
      case 'pan_foreboding':
        return {
          startScale: baseScale * 1.08,
          endScale: baseScale * 1.08,
          maxScale: baseScale * 1.08,
          panPercent: panTravel,
          tiltPercent: 0,
          isAnimated: true,
          speedMultiplier: 1.0,
        };

      case 'tilt_up':
      case 'tilt_down':
        return {
          startScale: baseScale * 1.08,
          endScale: baseScale * 1.08,
          maxScale: baseScale * 1.08,
          panPercent: 0,
          tiltPercent: panTravel,
          isAnimated: true,
          speedMultiplier: 1.0,
        };

      case 'speed_ramp_peak':
        return {
          startScale: baseScale * 1.04,
          endScale: baseScale * 1.12,
          maxScale: baseScale * 1.12,
          panPercent: 0,
          tiltPercent: 0,
          isAnimated: true,
          speedMultiplier: BRAND_BIBLE.motion.peakImplicationSpeedRamp, // 0.85x speed ramp
        };

      case 'static':
      default: {
        const scale = baseScale;
        return {
          startScale: scale,
          endScale: scale,
          maxScale: scale,
          panPercent: 0,
          tiltPercent: 0,
          isAnimated: false,
          speedMultiplier: 1.0,
        };
      }
    }
  }

  /**
   * Constructs the FFmpeg filter graph string for smooth camera motion.
   * Employs cubic easing approximation: progress = 3*(t/d)^2 - 2*(t/d)^3 (SmoothStep / easeInOutCubic).
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

    // Eased progress variable normalized to 0.0 -> 1.0: ease(p) = p*p*(3 - 2*p)
    const pExpr = `min(t/${d},1)`;
    const easeExpr = `(${pExpr}*${pExpr}*(3-2*${pExpr}))`;

    switch (normalized) {
      case 'push_in':
      case 'zoom_in':
      case 'speed_ramp_peak': {
        const delta = (params.endScale - params.startScale).toFixed(4);
        vf = `scale=w='trunc(${targetWidth}*(${params.startScale}+${delta}*${easeExpr})/2)*2':h='trunc(${targetHeight}*(${params.startScale}+${delta}*${easeExpr})/2)*2':eval=frame:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2:exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'pull_out':
      case 'zoom_out': {
        const delta = (params.startScale - params.endScale).toFixed(4);
        vf = `scale=w='trunc(${targetWidth}*(${params.startScale}-${delta}*${easeExpr})/2)*2':h='trunc(${targetHeight}*(${params.startScale}-${delta}*${easeExpr})/2)*2':eval=frame:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2:exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'punch_in': {
        const delta = (params.endScale - params.startScale).toFixed(4);
        vf = `scale=w='trunc(${targetWidth}*(${params.startScale}+${delta}*${easeExpr})/2)*2':h='trunc(${targetHeight}*(${params.startScale}+${delta}*${easeExpr})/2)*2':eval=frame:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2:exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'pan_left':
      case 'pan_foreboding': {
        const scaleW = Math.round((targetWidth * params.startScale) / 2) * 2;
        const scaleH = Math.round((targetHeight * params.startScale) / 2) * 2;
        const startX = 0.5 + params.panPercent / 2;
        const travel = params.panPercent.toFixed(2);
        vf = `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:x='(in_w-out_w)*(${startX.toFixed(2)}-${travel}*${easeExpr})':y='(in_h-out_h)/2':exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'pan_right': {
        const scaleW = Math.round((targetWidth * params.startScale) / 2) * 2;
        const scaleH = Math.round((targetHeight * params.startScale) / 2) * 2;
        const startX = 0.5 - params.panPercent / 2;
        const travel = params.panPercent.toFixed(2);
        vf = `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:x='(in_w-out_w)*(${startX.toFixed(2)}+${travel}*${easeExpr})':y='(in_h-out_h)/2':exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'tilt_up': {
        const scaleW = Math.round((targetWidth * params.startScale) / 2) * 2;
        const scaleH = Math.round((targetHeight * params.startScale) / 2) * 2;
        const startY = 0.5 + params.tiltPercent / 2;
        const travel = params.tiltPercent.toFixed(2);
        vf = `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:x='(in_w-out_w)/2':y='(in_h-out_h)*(${startY.toFixed(2)}-${travel}*${easeExpr})':exact=1,setsar=1,fps=${fps}`;
        break;
      }

      case 'tilt_down': {
        const scaleW = Math.round((targetWidth * params.startScale) / 2) * 2;
        const scaleH = Math.round((targetHeight * params.startScale) / 2) * 2;
        const startY = 0.5 - params.tiltPercent / 2;
        const travel = params.tiltPercent.toFixed(2);
        vf = `scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:x='(in_w-out_w)/2':y='(in_h-out_h)*(${startY.toFixed(2)}+${travel}*${easeExpr})':exact=1,setsar=1,fps=${fps}`;
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

    // Punctuation transitions
    if (transition === 'fade' || transition === 'fade_black') {
      vf += `,fade=t=in:st=0:d=0.25:color=black`;
    } else if (transition === 'flash' || transition === 'signature_twist_reveal') {
      vf += `,fade=t=in:st=0:d=0.12:color=white`;
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

    const safeInPoint = Math.max(0, inPoint);
    const ssArg = safeInPoint > 0.05 ? `-ss ${safeInPoint.toFixed(3)}` : '';
    const cmd = `ffmpeg -y ${ssArg} -i "${inputPath}" -vf "${vf}" -c:v libx264 -preset ultrafast -t ${durationSeconds.toFixed(3)} -r ${fps} -an "${outputPath}"`;

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch {
      const fallbackVf = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2,setsar=1,fps=${fps}`;
      execSync(
        `ffmpeg -y ${ssArg} -i "${inputPath}" -vf "${fallbackVf}" -c:v libx264 -preset ultrafast -t ${durationSeconds.toFixed(3)} -r ${fps} -an "${outputPath}"`,
        { stdio: 'pipe' }
      );
    }

    return outputPath;
  }
}
