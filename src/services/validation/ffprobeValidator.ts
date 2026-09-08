import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ValidationArtifact, ValidationMetrics } from '../../contracts/artifacts';
import { AppConfig, VIDEO_PROFILES } from '../../config';
import { PipelineLogger } from '../logging/logger';

export class FFprobeValidator {
  constructor(private config: AppConfig, private logger: PipelineLogger) {}

  public validateRenderedVideo(
    videoPath: string,
    profileName: string,
    expectedAudioDurationSec: number,
    outputDir: string
  ): ValidationArtifact {
    this.logger.stageStart('validation', `Inspecting ${videoPath}`);

    const inspectedAt = new Date().toISOString();
    const profile = VIDEO_PROFILES[profileName] || VIDEO_PROFILES['vertical-1080'];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. File existence check
    if (!fs.existsSync(videoPath)) {
      errors.push(`Video file does not exist at "${videoPath}".`);
      return this.writeValidationArtifact(outputDir, {
        passed: false,
        inspectedAt,
        targetProfile: profileName,
        expectedSpecs: {
          width: profile.width,
          height: profile.height,
          aspectRatio: '9:16',
          videoCodec: 'h264',
          audioCodec: 'aac',
          maxDurationDeltaSec: 0.6,
        },
        actualMetrics: {
          width: 0,
          height: 0,
          aspectRatio: '0:0',
          videoCodec: 'none',
          audioCodec: 'none',
          videoDurationSec: 0,
          audioDurationSec: 0,
          durationDeltaSec: 999,
          fps: 0,
          fileSizeBytes: 0,
          hasVideoStream: false,
          hasAudioStream: false,
        },
        errors,
        warnings,
      });
    }

    // 2. Minimum file size check (> 50KB)
    const fileStats = fs.statSync(videoPath);
    if (fileStats.size < 50 * 1024) {
      errors.push(`File size (${fileStats.size} bytes) is below minimum threshold of 50KB.`);
    }

    // 3. Probe with FFprobe
    let probeData: any;
    try {
      const cmd = `${this.config.ffprobeBin} -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
      const stdout = execSync(cmd, { stdio: 'pipe' }).toString();
      probeData = JSON.parse(stdout);
    } catch (err: any) {
      errors.push(`FFprobe inspection execution failed: ${err.message || err}`);
      probeData = { streams: [], format: {} };
    }

    const videoStream = (probeData.streams || []).find((s: any) => s.codec_type === 'video');
    const audioStream = (probeData.streams || []).find((s: any) => s.codec_type === 'audio');

    const width = videoStream?.width || 0;
    const height = videoStream?.height || 0;
    const videoCodec = (videoStream?.codec_name || '').toLowerCase();
    const audioCodec = (audioStream?.codec_name || '').toLowerCase();

    const videoDurationSec = parseFloat(videoStream?.duration || probeData.format?.duration || '0');
    const audioDurationSec = parseFloat(audioStream?.duration || probeData.format?.duration || '0');
    const durationDeltaSec = Math.abs(videoDurationSec - expectedAudioDurationSec);

    // Calculate frame rate
    let fps = 0;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      if (den && den > 0) fps = Number((num / den).toFixed(2));
    }

    // Validate streams exist
    if (!videoStream) {
      errors.push('No video stream found in the rendered file.');
    }
    if (!audioStream) {
      errors.push('No audio stream found in the rendered file.');
    }

    // Validate video codec
    if (videoStream && !['h264', 'avc1'].includes(videoCodec)) {
      errors.push(`Invalid video codec: "${videoCodec}". Expected "h264".`);
    }

    // Validate audio codec
    if (audioStream && !['aac', 'mp4a'].includes(audioCodec)) {
      errors.push(`Invalid audio codec: "${audioCodec}". Expected "aac".`);
    }

    // Validate resolution
    if (width !== profile.width || height !== profile.height) {
      errors.push(
        `Resolution mismatch: got ${width}x${height}, expected ${profile.width}x${profile.height} for profile "${profileName}".`
      );
    }

    // Validate aspect ratio (9:16 = 0.5625)
    const aspect = width > 0 && height > 0 ? width / height : 0;
    const targetAspect = profile.width / profile.height;
    if (Math.abs(aspect - targetAspect) > 0.02) {
      errors.push(`Aspect ratio mismatch: got ${aspect.toFixed(4)}, expected ~${targetAspect.toFixed(4)} (9:16 vertical).`);
    }

    // Validate duration alignment
    const maxAllowedDeltaSec = 0.8;
    if (durationDeltaSec > maxAllowedDeltaSec) {
      errors.push(
        `Duration delta too large: video duration (${videoDurationSec.toFixed(2)}s) differs from narration duration (${expectedAudioDurationSec.toFixed(2)}s) by ${durationDeltaSec.toFixed(2)}s (max allowed: ${maxAllowedDeltaSec}s).`
      );
    }

    // Check audio vs video duration inside the container
    if (Math.abs(videoDurationSec - audioDurationSec) > 0.8) {
      warnings.push(
        `Internal container stream skew: video stream (${videoDurationSec.toFixed(2)}s) vs audio stream (${audioDurationSec.toFixed(2)}s).`
      );
    }

    const passed = errors.length === 0;

    const actualMetrics: ValidationMetrics = {
      width,
      height,
      aspectRatio: `${width}:${height}`,
      videoCodec,
      audioCodec,
      videoDurationSec: Number(videoDurationSec.toFixed(3)),
      audioDurationSec: Number(audioDurationSec.toFixed(3)),
      durationDeltaSec: Number(durationDeltaSec.toFixed(3)),
      fps,
      fileSizeBytes: fileStats.size,
      hasVideoStream: Boolean(videoStream),
      hasAudioStream: Boolean(audioStream),
    };

    const artifact: ValidationArtifact = {
      passed,
      inspectedAt,
      targetProfile: profileName,
      expectedSpecs: {
        width: profile.width,
        height: profile.height,
        aspectRatio: '9:16',
        videoCodec: 'h264',
        audioCodec: 'aac',
        maxDurationDeltaSec: maxAllowedDeltaSec,
      },
      actualMetrics,
      errors,
      warnings,
    };

    this.writeValidationArtifact(outputDir, artifact);

    if (!passed) {
      this.logger.stageError('validation', `Validation FAILED with ${errors.length} error(s): ${errors.join(', ')}`);
      throw new Error(`Video post-render validation failed: ${errors.join('; ')}`);
    }

    this.logger.stageCompleted(
      'validation',
      `ALL SPEC CHECKS PASSED: ${width}x${height} 9:16, H.264/AAC, duration: ${videoDurationSec.toFixed(2)}s, delta: ${durationDeltaSec.toFixed(3)}s`
    );

    return artifact;
  }

  private writeValidationArtifact(outputDir: string, artifact: ValidationArtifact): ValidationArtifact {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const validationFile = path.join(outputDir, 'validation.json');
    fs.writeFileSync(validationFile, JSON.stringify(artifact, null, 2));
    return artifact;
  }
}
