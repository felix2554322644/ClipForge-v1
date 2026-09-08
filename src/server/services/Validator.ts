import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ValidationArtifact, ValidationChecks, ValidationMetrics } from '../../types/pipeline.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

export class Validator {
  public async validateOutput(
    jobId: string,
    videoPath: string,
    expected: { width: number; height: number; durationSec: number; fps?: number }
  ): Promise<ValidationArtifact> {
    logger.info(jobId, 'ffprobe_validation', `Validating rendered MP4 with FFprobe: ${videoPath}`);

    const errors: string[] = [];
    const checks: ValidationChecks = {
      fileExists: false,
      hasVideoStream: false,
      hasAudioStream: false,
      durationValid: false,
      resolutionValid: false,
      aspectRatioValid: false,
      videoCodecValid: false,
      audioCodecValid: false,
      fpsValid: false,
      ffprobeReadable: false,
    };

    let metrics: ValidationMetrics = {
      actualDurationSec: 0,
      expectedDurationSec: expected.durationSec,
      width: 0,
      height: 0,
      videoCodec: 'unknown',
      audioCodec: 'unknown',
      fps: 0,
      fileSizeBytes: 0,
    };

    // 1. Check file existence and size
    try {
      const stats = await fs.stat(videoPath);
      metrics.fileSizeBytes = stats.size;
      checks.fileExists = stats.size > 1024; // At least 1KB
      if (!checks.fileExists) {
        errors.push(`Rendered video file is empty or missing (size: ${stats.size} bytes)`);
      }
    } catch (err: any) {
      errors.push(`Video file does not exist at ${videoPath}: ${err.message}`);
      return {
        passed: false,
        videoPath,
        checks,
        metrics,
        errors,
        validatedAt: new Date().toISOString(),
      };
    }

    // 2. Probe media with FFprobe
    let probeData: any = null;
    try {
      const { stdout } = await execFileAsync(config.ffprobePath, [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        videoPath,
      ]);
      probeData = JSON.parse(stdout);
      checks.ffprobeReadable = true;
    } catch (err: any) {
      checks.ffprobeReadable = false;
      errors.push(`FFprobe inspection failed: ${err.message}`);
      return {
        passed: false,
        videoPath,
        checks,
        metrics,
        errors,
        validatedAt: new Date().toISOString(),
      };
    }

    const streams: any[] = probeData.streams || [];
    const videoStream = streams.find(s => s.codec_type === 'video');
    const audioStream = streams.find(s => s.codec_type === 'audio');

    // 3. Validate streams
    if (videoStream) {
      checks.hasVideoStream = true;
      metrics.width = videoStream.width || 0;
      metrics.height = videoStream.height || 0;
      metrics.videoCodec = videoStream.codec_name || 'unknown';

      // Parse fps from "30/1" or "29.97"
      if (videoStream.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split('/');
        metrics.fps = parts.length === 2 ? Math.round(parseInt(parts[0], 10) / parseInt(parts[1], 10)) : parseFloat(videoStream.r_frame_rate);
      }
    } else {
      errors.push('No video stream found in MP4 container');
    }

    if (audioStream) {
      checks.hasAudioStream = true;
      metrics.audioCodec = audioStream.codec_name || 'unknown';
    } else {
      errors.push('No audio stream found in MP4 container');
    }

    // 4. Validate Duration
    const formatDur = parseFloat(probeData.format?.duration || '0');
    metrics.actualDurationSec = parseFloat(formatDur.toFixed(2));
    const durationDelta = Math.abs(metrics.actualDurationSec - expected.durationSec);
    // Allow up to 1.5s tolerance for audio tail/rounding
    checks.durationValid = metrics.actualDurationSec > 1.0 && durationDelta <= 2.0;
    if (!checks.durationValid) {
      errors.push(`Duration deviation: actual ${metrics.actualDurationSec}s vs expected ${expected.durationSec}s (tolerance: 2.0s)`);
    }

    // 5. Validate Resolution and Aspect Ratio
    checks.resolutionValid = metrics.width === expected.width && metrics.height === expected.height;
    if (!checks.resolutionValid) {
      errors.push(`Resolution mismatch: got ${metrics.width}x${metrics.height}, expected ${expected.width}x${expected.height}`);
    }

    const actualAspect = metrics.width / (metrics.height || 1);
    const expectedAspect = expected.width / expected.height;
    checks.aspectRatioValid = Math.abs(actualAspect - expectedAspect) < 0.02;
    if (!checks.aspectRatioValid) {
      errors.push(`Aspect ratio mismatch: actual ${actualAspect.toFixed(3)} vs expected ${expectedAspect.toFixed(3)} (9:16)`);
    }

    // 6. Validate Codecs
    checks.videoCodecValid = metrics.videoCodec === 'h264';
    if (!checks.videoCodecValid) {
      errors.push(`Video codec is not H.264 (found: ${metrics.videoCodec})`);
    }

    checks.audioCodecValid = metrics.audioCodec === 'aac';
    if (!checks.audioCodecValid) {
      errors.push(`Audio codec is not AAC (found: ${metrics.audioCodec})`);
    }

    // 7. Validate Framerate
    checks.fpsValid = metrics.fps >= 23;
    if (!checks.fpsValid) {
      errors.push(`Frame rate below minimum social spec: ${metrics.fps} fps`);
    }

    const passed = errors.length === 0;

    if (passed) {
      logger.info(jobId, 'ffprobe_validation', `Validation PASSED! ${metrics.width}x${metrics.height}, ${metrics.actualDurationSec}s, ${metrics.videoCodec}/${metrics.audioCodec}`);
    } else {
      logger.error(jobId, 'ffprobe_validation', `Validation FAILED with ${errors.length} errors: ${errors.join('; ')}`);
    }

    return {
      passed,
      videoPath,
      checks,
      metrics,
      errors,
      validatedAt: new Date().toISOString(),
    };
  }
}

export const validator = new Validator();
