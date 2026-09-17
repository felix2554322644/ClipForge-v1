import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../../config/index';
import { EditorialPlan } from '../../types/editorial';
import { PipelineLogger } from '../logging/logger';
import { BRAND_BIBLE } from '../../config/brandBible';

export interface VisualCohesionOptions {
  targetWidth?: number;
  targetHeight?: number;
  fps?: number;
  enableStabilization?: boolean;
  subjectAware?: boolean;
  mood?: 'neutral' | 'tense_cool' | 'resolution_warm' | 'dread_dark';
  enableFilmGrain?: boolean;
}

export class VisualCohesionService {
  constructor(private logger?: PipelineLogger) {}

  /**
   * Two-pass grading pipeline:
   * Pass 1: Normalizing grade applied uniformly to harmonize contrast/saturation baseline across diverse stock.
   * Pass 2: Mood grade keyed to each beat's emotional tag + consistent subtle film grain.
   */
  processShotVisuals(
    inputPath: string,
    outputPath: string,
    motionEffect: string,
    cropMode: string,
    isVerticalTarget: boolean,
    prevMotionEffect?: string,
    options: VisualCohesionOptions = {}
  ): string {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`VisualCohesionService: Input video not found at ${inputPath}`);
    }

    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const targetWidth = options.targetWidth || (isVerticalTarget ? CONFIG.TARGET_WIDTH : 1920);
    const targetHeight = options.targetHeight || (isVerticalTarget ? CONFIG.TARGET_HEIGHT : 1080);
    const fps = options.fps || CONFIG.TARGET_FPS;

    // 1. Motion Continuity Adjustment
    let effectiveMotion = motionEffect;
    if (prevMotionEffect && prevMotionEffect.toLowerCase() === motionEffect.toLowerCase()) {
      if (motionEffect === 'push_in' || motionEffect === 'zoom_in') {
        effectiveMotion = 'pan_left';
      } else if (motionEffect === 'pan_left') {
        effectiveMotion = 'push_in';
      } else {
        effectiveMotion = 'static';
      }
      this.logger?.info?.(`VisualCohesion: Continuity check adjusted repeating motion '${motionEffect}' to '${effectiveMotion}'`);
    }

    // 2. Pass 1: Normalizing Grade & Smart Reframing
    let reframeFilter = '';
    if (cropMode === 'punch_in') {
      const pW = Math.round((targetWidth * 1.15) / 2) * 2;
      const pH = Math.round((targetHeight * 1.15) / 2) * 2;
      reframeFilter = `scale=${pW}:${pH}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2`;
    } else if (cropMode === 'tight') {
      const tW = Math.round((targetWidth * 1.25) / 2) * 2;
      const tH = Math.round((targetHeight * 1.25) / 2) * 2;
      reframeFilter = `scale=${tW}:${tH}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2`;
    } else {
      reframeFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(in_w-out_w)/2:(in_h-out_h)/2`;
    }

    const pass1Normalize = 'eq=contrast=1.06:brightness=0.01:saturation=1.05';

    // 3. Pass 2: Mood Grade Keyed to Emotional Intent
    const mood = options.mood || 'neutral';
    let pass2Mood = '';
    switch (mood) {
      case 'tense_cool':
      case 'dread_dark':
        pass2Mood = 'colorbalance=bs=0.08:gs=-0.02:rs=-0.06,eq=contrast=1.14:brightness=-0.02:saturation=0.92';
        break;
      case 'resolution_warm':
        pass2Mood = 'colorbalance=rs=0.07:gs=0.03:bs=-0.05,eq=contrast=1.04:brightness=0.02:saturation=1.08';
        break;
      case 'neutral':
      default:
        pass2Mood = 'colorbalance=rs=0.02:bs=-0.01,eq=contrast=1.03:saturation=1.02';
        break;
    }

    // Consistent subtle organic film grain across everything
    const filmGrain = options.enableFilmGrain !== false ? ',noise=alls=4:allf=t+u' : '';

    const filterComplex = `${reframeFilter},${pass1Normalize},${pass2Mood}${filmGrain},setsar=1,fps=${fps}`;

    const cmd = `ffmpeg -y -i "${inputPath}" -vf "${filterComplex}" -c:v libx264 -preset ultrafast -crf 22 -r ${fps} -an "${outputPath}"`;

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch (err) {
      this.logger?.warn?.(`VisualCohesionService: Two-pass grading failed (${(err as Error).message}). Falling back to safe reframe.`);
      const fallbackCmd = `ffmpeg -y -i "${inputPath}" -vf "scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},setsar=1,fps=${fps}" -c:v libx264 -preset ultrafast -crf 23 -an "${outputPath}"`;
      execSync(fallbackCmd, { stdio: 'pipe' });
    }

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error(`VisualCohesionService: Failed to produce processed video at ${outputPath}`);
    }

    return outputPath;
  }

  /**
   * Validates and tunes an editorial plan for consecutive shot visual continuity.
   */
  enforceEditorialContinuity(plan: EditorialPlan): EditorialPlan {
    const decisions = [...plan.decisions];
    for (let i = 1; i < decisions.length; i++) {
      const prev = decisions[i - 1];
      const curr = decisions[i];
      if (prev.motionEffect && curr.motionEffect && prev.motionEffect === curr.motionEffect) {
        curr.motionEffect = prev.motionEffect === 'push_in' ? 'pan_left' : 'push_in';
      }
    }
    return {
      ...plan,
      decisions,
    };
  }
}
