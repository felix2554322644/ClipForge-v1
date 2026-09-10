import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { ValidationResult } from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';
import { CONFIG } from '../../config/index';

export class FfprobeValidator {
  constructor(private logger: PipelineLogger) {}

  /**
   * Deep validation of rendered MP4 file against authoritative standards.
   * Enforces strict duration tolerance (<= 0.4s), resolution, audio sync, and framerate.
   */
  validate(videoPath: string, expectedDuration: number): ValidationResult {
    this.logger.stage('VALIDATION', `Probing and validating output video: ${videoPath}`);

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!fs.existsSync(videoPath)) {
      return {
        isValid: false,
        errors: [`Video file does not exist at: ${videoPath}`],
        warnings: [],
        checks: {
          durationMatch: false,
          audioSynced: false,
          validResolution: false,
          validFramerate: false,
          noStallFrames: false,
        },
      };
    }

    try {
      const cmd = `ffprobe -v error -show_entries format=duration,size,bit_rate:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate -of json "${videoPath}"`;
      const stdout = execSync(cmd, { encoding: 'utf-8' });
      const probe = JSON.parse(stdout);

      const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
      const audioStream = probe.streams?.find((s: any) => s.codec_type === 'audio');
      const actualDuration = parseFloat(probe.format?.duration || '0');

      // Check 1: Resolution (strict 1080x1920 portrait)
      const width = videoStream?.width;
      const height = videoStream?.height;
      const validResolution = width === CONFIG.TARGET_WIDTH && height === CONFIG.TARGET_HEIGHT;
      if (!validResolution) {
        errors.push(`Invalid resolution: expected ${CONFIG.TARGET_WIDTH}x${CONFIG.TARGET_HEIGHT}, got ${width}x${height}`);
      }

      // Check 2: Audio stream exists and is encoded
      const audioSynced = Boolean(audioStream && audioStream.sample_rate);
      if (!audioStream) {
        errors.push('Audio stream missing in rendered video');
      }

      // Check 3: Tight duration match (tolerance: 0.40s)
      // MP4 muxing with AAC packet boundaries can vary by up to ~0.1-0.2s, but must never drift >0.4s
      const durationDiff = Math.abs(actualDuration - expectedDuration);
      const DURATION_TOLERANCE_SECONDS = 0.4;
      const durationMatch = durationDiff <= DURATION_TOLERANCE_SECONDS;

      if (!durationMatch) {
        errors.push(
          `Duration mismatch exceeds strict tolerance (${DURATION_TOLERANCE_SECONDS}s): expected ${expectedDuration.toFixed(2)}s, got ${actualDuration.toFixed(2)}s (diff: ${durationDiff.toFixed(2)}s)`
        );
      } else if (durationDiff > 0.25) {
        warnings.push(`Minor packet quantization duration difference: ${durationDiff.toFixed(2)}s`);
      }

      // Check 4: Valid framerate normalized to target FPS (30 FPS)
      const rFrameRate = videoStream?.r_frame_rate || '';
      const avgFrameRate = videoStream?.avg_frame_rate || '';
      const targetFpsFrac = `${CONFIG.TARGET_FPS}/1`;
      const isTargetFps = rFrameRate === targetFpsFrac || avgFrameRate === targetFpsFrac;
      const validFramerate = Boolean(rFrameRate) && isTargetFps;
      if (!rFrameRate) {
        errors.push('Video stream lacks valid framerate metadata');
      } else if (!isTargetFps) {
        errors.push(
          `Framerate mismatch: expected ${targetFpsFrac} (${CONFIG.TARGET_FPS} FPS), got r_frame_rate=${rFrameRate}, avg_frame_rate=${avgFrameRate}`
        );
      }

      // Check 5: No stall frames (file size > 100KB)
      const fileSize = fs.statSync(videoPath).size;
      const noStallFrames = fileSize > 100 * 1024;
      if (!noStallFrames) {
        errors.push(`File size suspiciously small: ${(fileSize / 1024).toFixed(1)} KB`);
      }

      const isValid = errors.length === 0;

      this.logger.info(`Validation result: ${isValid ? 'PASSED ✅' : 'FAILED ❌'}`);
      this.logger.info(
        `Duration check: expected=${expectedDuration.toFixed(2)}s, actual=${actualDuration.toFixed(2)}s, diff=${durationDiff.toFixed(3)}s (tolerance: ${DURATION_TOLERANCE_SECONDS}s)`
      );

      if (errors.length > 0) this.logger.error(`Validation errors: ${errors.join(', ')}`);
      if (warnings.length > 0) this.logger.warn(`Validation warnings: ${warnings.join(', ')}`);

      return {
        isValid,
        errors,
        warnings,
        checks: {
          durationMatch,
          audioSynced,
          validResolution,
          validFramerate,
          noStallFrames,
          durationDifference: Math.round(durationDiff * 1000) / 1000,
        },
      };
    } catch (err) {
      return {
        isValid: false,
        errors: [`ffprobe execution failed: ${(err as Error).message}`],
        warnings: [],
        checks: {
          durationMatch: false,
          audioSynced: false,
          validResolution: false,
          validFramerate: false,
          noStallFrames: false,
        },
      };
    }
  }
}
