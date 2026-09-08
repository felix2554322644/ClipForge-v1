import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { loadConfig } from '../src/config';
import { TimelineArtifact } from '../src/contracts/artifacts';
import { PipelineLogger } from '../src/services/logging/logger';
import { FFmpegRenderer } from '../src/services/rendering/ffmpegRenderer';
import { FFprobeValidator } from '../src/services/validation/ffprobeValidator';

describe('End-to-End Programmatic Renderer & FFprobe Validator', () => {
  const config = loadConfig();
  const testDir = path.resolve(process.cwd(), 'artifacts', 'test_e2e_render');
  const logger = new PipelineLogger('test_e2e', testDir);

  const clip1Path = path.join(testDir, 'sample_landscape.mp4');
  const clip2Path = path.join(testDir, 'sample_portrait.mp4');
  const audioPath = path.join(testDir, 'sample_narration.wav');

  before(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Generate test landscape video (1920x1080, 4s)
    spawnSync(config.ffmpegBin, [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=size=1920x1080:rate=30,drawbox=x=100:y=100:w=300:h=300:color=red@0.8:t=fill',
      '-t', '4',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      clip1Path,
    ], { stdio: 'pipe' });

    // Generate test portrait video (1080x1920, 4s)
    spawnSync(config.ffmpegBin, [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=size=1080x1920:rate=30,drawbox=x=100:y=100:w=300:h=300:color=blue@0.8:t=fill',
      '-t', '4',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      clip2Path,
    ], { stdio: 'pipe' });

    // Generate test audio (sine wave spoken-style rhythm, 6.0 seconds)
    spawnSync(config.ffmpegBin, [
      '-y',
      '-f', 'lavfi',
      '-i', 'sine=frequency=300:duration=6',
      '-ar', '22050',
      '-ac', '1',
      audioPath,
    ], { stdio: 'pipe' });
  });

  after(() => {
    // Clean up temporary test files if desired
  });

  it('should render a 9:16 vertical MP4 and pass FFprobe validation', async () => {
    const renderer = new FFmpegRenderer(config, logger);
    const validator = new FFprobeValidator(config, logger);

    const testTimeline: TimelineArtifact = {
      profile: 'vertical-1080',
      resolution: { width: 1080, height: 1920 },
      targetDurationSec: 6.0,
      actualAudioDurationSec: 6.0,
      totalVisualDurationSec: 6.0,
      tracks: {
        videoClips: [
          {
            clipId: 'clip_1',
            sceneId: 'scene_1',
            assetPath: clip1Path,
            startTime: 0,
            endTime: 3.0,
            duration: 3.0,
            trimStart: 0,
            trimEnd: 3.0,
            reframing: {
              sourceWidth: 1920,
              sourceHeight: 1080,
              cropX: 656,
              cropY: 0,
              cropWidth: 608,
              cropHeight: 1080,
              scaleFactor: 1.777,
              targetWidth: 1080,
              targetHeight: 1920,
            },
            motion: { type: 'zoom_in', startZoom: 1.0, endZoom: 1.1, duration: 3.0 },
          },
          {
            clipId: 'clip_2',
            sceneId: 'scene_2',
            assetPath: clip2Path,
            startTime: 3.0,
            endTime: 6.0,
            duration: 3.0,
            trimStart: 0,
            trimEnd: 3.0,
            reframing: {
              sourceWidth: 1080,
              sourceHeight: 1920,
              cropX: 0,
              cropY: 0,
              cropWidth: 1080,
              cropHeight: 1920,
              scaleFactor: 1.0,
              targetWidth: 1080,
              targetHeight: 1920,
            },
            motion: { type: 'zoom_out', startZoom: 1.1, endZoom: 1.0, duration: 3.0 },
          },
        ],
        audioTrack: {
          assetPath: audioPath,
          duration: 6.0,
          sampleRate: 22050,
          channels: 1,
        },
      },
      metadata: { generatedAt: new Date().toISOString() },
    };

    const { outputPath, report } = await renderer.renderTimeline(testTimeline, testDir, 'test_e2e_job');

    assert.ok(fs.existsSync(outputPath), 'final-video.mp4 must exist on disk');
    assert.strictEqual(report.success, true);
    assert.ok(report.outputSizeBytes > 10000);

    const validation = validator.validateRenderedVideo(outputPath, 'vertical-1080', 6.0, testDir);

    assert.strictEqual(validation.passed, true);
    assert.strictEqual(validation.actualMetrics.width, 1080);
    assert.strictEqual(validation.actualMetrics.height, 1920);
    assert.strictEqual(validation.actualMetrics.videoCodec, 'h264');
    assert.strictEqual(validation.actualMetrics.audioCodec, 'aac');
    assert.ok(validation.actualMetrics.durationDeltaSec <= 0.6);
  });
});
