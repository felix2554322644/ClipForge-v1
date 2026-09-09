import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/config/index';
import { PipelineLogger } from '../src/services/logging/logger';
import { PiperNarrationEngine } from '../src/services/narration/piper';
import { EditingPrimitives } from '../src/services/media/primitives';
import { TimelineBuilder } from '../src/services/timeline/builder';
import { FfmpegRenderer } from '../src/services/rendering/ffmpegRenderer';
import { FfprobeValidator } from '../src/services/validation/ffprobeValidator';
import { SelectedBrollScene, ScenePlanOutput } from '../src/types/pipeline';

test('E2E Render: End-to-end micro synthesis, composite render, and validation', async () => {
  const testDir = path.join(CONFIG.OUTPUT_DIR, 'test_e2e_render');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const logger = new PipelineLogger(testDir);
  const narrationEngine = new PiperNarrationEngine(logger);
  const timelineBuilder = new TimelineBuilder(logger);
  const renderer = new FfmpegRenderer(logger);
  const validator = new FfprobeValidator(logger);

  // 1. Synthesize audio with Piper
  const audioPath = path.join(testDir, 'sample_narration.wav');
  const audioArtifact = await narrationEngine.synthesizeSpeech(
    'Deep space signals hit Earth from billions of light years away.',
    audioPath
  );
  assert.ok(fs.existsSync(audioPath), 'Synthesized audio missing');

  // 2. Generate 2 procedural 1080x1920 video clips
  const clip1 = path.join(testDir, 'clip1.mp4');
  const clip2 = path.join(testDir, 'clip2.mp4');
  EditingPrimitives.generateProceduralFootage(clip1, 3, 'galaxy', 1080, 1920, 30);
  EditingPrimitives.generateProceduralFootage(clip2, 3, 'pulsar', 1080, 1920, 30);

  const halfDuration = audioArtifact.durationSeconds / 2;
  const scenePlan: ScenePlanOutput = {
    totalDurationSeconds: audioArtifact.durationSeconds,
    scenes: [
      {
        index: 0,
        narration: 'Scene 1',
        durationSeconds: halfDuration,
        brollQuery: ['galaxy'],
        motionEffect: 'zoom_in',
        captionText: 'Scene 1',
      },
      {
        index: 1,
        narration: 'Scene 2',
        durationSeconds: halfDuration,
        brollQuery: ['pulsar'],
        motionEffect: 'zoom_out',
        captionText: 'Scene 2',
      },
    ],
  };

  const broll: SelectedBrollScene[] = [
    {
      sceneIndex: 0,
      broll: {
        id: 'c1',
        url: '',
        videoPath: clip1,
        originalWidth: 1080,
        originalHeight: 1920,
        aspectRatio: 9 / 16,
        durationSeconds: 3,
        relevanceScore: 90,
        source: 'procedural',
      },
      inPoint: 0,
      outPoint: halfDuration,
    },
    {
      sceneIndex: 1,
      broll: {
        id: 'c2',
        url: '',
        videoPath: clip2,
        originalWidth: 1080,
        originalHeight: 1920,
        aspectRatio: 9 / 16,
        durationSeconds: 3,
        relevanceScore: 90,
        source: 'procedural',
      },
      inPoint: 0,
      outPoint: halfDuration,
    },
  ];

  // 3. Assemble timeline
  const timeline = timelineBuilder.buildTimeline(scenePlan, broll, audioPath);

  // 4. Render final video
  const finalVideoPath = path.join(testDir, 'final-video.mp4');
  const report = await renderer.render(timeline, finalVideoPath);

  assert.ok(fs.existsSync(finalVideoPath), 'Rendered video file does not exist');
  assert.ok(report.fileSizeBytes > 50000, `File size too small: ${report.fileSizeBytes} bytes`);

  // 5. Deep validation with ffprobe
  const validation = validator.validate(finalVideoPath, timeline.totalDurationSeconds);
  assert.ok(validation.isValid, `Validation failed: ${validation.errors.join(', ')}`);
  assert.ok(validation.checks.validResolution, 'Resolution must be 1080x1920');
  assert.ok(validation.checks.audioSynced, 'Audio stream must be present');

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});
