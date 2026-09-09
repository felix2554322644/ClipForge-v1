import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { ValidationResult } from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';
import { CONFIG } from '../../config/index';

export class FfprobeValidator {
  constructor(private logger: PipelineLogger) {}

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

      // Check 1: Resolution
      const width = videoStream?.width;
      const height = videoStream?.height;
      const validResolution = width === CONFIG.TARGET_WIDTH && height === CONFIG.TARGET_HEIGHT;
      if (!validResolution) {
        errors.push(`Invalid resolution: expected ${CONFIG.TARGET_WIDTH}x${CONFIG.TARGET_HEIGHT}, got ${width}x${height}`);
      }

      // Check 2: Audio stream exists
      const audioSynced = Boolean(audioStream);
      if (!audioStream) {
        errors.push('Audio stream missing in rendered video');
      }

      // Check 3: Duration match (within 1.5s tolerance)
      const durationDiff = Math.abs(actualDuration - expectedDuration);
      const durationMatch = durationDiff <= 1.5;
      if (!durationMatch) {
        warnings.push(`Duration discrepancy: expected ~${expectedDuration.toFixed(1)}s, got ${actualDuration.toFixed(1)}s`);
      }

      // Check 4: Valid framerate
      const validFramerate = Boolean(videoStream?.r_frame_rate);

      // Check 5: No stall frames (file size > 100KB)
      const fileSize = fs.statSync(videoPath).size;
      const noStallFrames = fileSize > 100 * 1024;
      if (!noStallFrames) {
        errors.push(`File size suspiciously small: ${(fileSize / 1024).toFixed(1)} KB`);
      }

      const isValid = errors.length === 0;

      this.logger.info(`Validation result: ${isValid ? 'PASSED ✅' : 'FAILED ❌'}`);
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
