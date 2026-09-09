import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/config/index';
import { PipelineLogger } from '../src/services/logging/logger';
import { PiperNarrationEngine } from '../src/services/narration/piper';
import { CaptionEngine } from '../src/services/captions/captionEngine';
import { EditingPrimitives } from '../src/services/media/primitives';
import { TimelineBuilder } from '../src/services/timeline/builder';
import { FfmpegRenderer } from '../src/services/rendering/ffmpegRenderer';
import { FfprobeValidator } from '../src/services/validation/ffprobeValidator';
import { SelectedBrollScene, ScenePlanOutput } from '../src/types/pipeline';

test('E2E Render: End-to-end micro synthesis, composite render, and validation with burned-in captions', async () => {
  const testDir = path.join(CONFIG.OUTPUT_DIR, 'test_e2e_render');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const logger = new PipelineLogger(testDir);
  const narrationEngine = new PiperNarrationEngine(logger);
  const captionEngine = new CaptionEngine(logger);
  const timelineBuilder = new TimelineBuilder(logger);
  const renderer = new FfmpegRenderer(logger);
  const validator = new FfprobeValidator(logger);

  // 1. Synthesize audio with Piper
  const speechText = 'Deep space signals hit Earth from billions of light years away.';
  const audioPath = path.join(testDir, 'sample_narration.wav');
  const audioArtifact = await narrationEngine.synthesizeSpeech(speechText, audioPath);
  assert.ok(fs.existsSync(audioPath), 'Synthesized audio missing');

  // 2. Generate synchronized captions and ASS file
  const captionsAssPath = path.join(testDir, 'captions.ass');
  const { segments: captions, assPath } = captionEngine.generateCaptions(
    speechText,
    audioArtifact.durationSeconds,
    captionsAssPath
  );
  assert.ok(fs.existsSync(captionsAssPath), 'Captions ASS file missing');
  assert.ok(captions.length >= 2, 'Should generate at least 2 caption segments');

  // 3. Generate procedural 1080x1920 video clips with distinct themes
  const clip1 = path.join(testDir, 'clip1.mp4');
  const clip2 = path.join(testDir, 'clip2.mp4');
  EditingPrimitives.generateProceduralFootage(clip1, 4, 'telescope', 1080, 1920, 30);
  EditingPrimitives.generateProceduralFootage(clip2, 4, 'pulsar', 1080, 1920, 30);

  const halfDuration = Math.round((audioArtifact.durationSeconds / 2) * 100) / 100;
  const remainderDuration = Math.round((audioArtifact.durationSeconds - halfDuration) * 100) / 100;

  const scenePlan: ScenePlanOutput = {
    totalDurationSeconds: audioArtifact.durationSeconds,
    scenes: [
      {
        index: 0,
        narration: 'Deep space signals hit Earth',
        durationSeconds: halfDuration,
        brollQuery: ['telescope', 'observatory'],
        motionEffect: 'zoom_in',
        captionText: 'Deep space signals hit Earth',
        shots: [
          {
            id: 'scene_0_shot_0',
            sceneIndex: 0,
            shotIndex: 0,
            narrationClause: 'Deep space signals hit Earth',
            durationSeconds: halfDuration,
            pacingType: 'normal',
            brollQueries: ['telescope dish'],
            motionEffect: 'zoom_in',
            transition: 'cut',
            captionText: 'Deep space signals hit Earth',
          },
        ],
      },
      {
        index: 1,
        narration: 'from billions of light years away.',
        durationSeconds: remainderDuration,
        brollQuery: ['pulsar', 'energy burst'],
        motionEffect: 'zoom_out',
        captionText: 'from billions of light years away.',
        shots: [
          {
            id: 'scene_1_shot_0',
            sceneIndex: 1,
            shotIndex: 0,
            narrationClause: 'from billions of light years away.',
            durationSeconds: remainderDuration,
            pacingType: 'fast',
            brollQueries: ['pulsar star'],
            motionEffect: 'zoom_out',
            transition: 'fade',
            captionText: 'from billions of light years away.',
          },
        ],
      },
    ],
  };

  const broll: SelectedBrollScene[] = [
    {
      sceneIndex: 0,
      shotId: 'scene_0_shot_0',
      shotIndex: 0,
      provider: 'pexels',
      providerAssetId: 'pexels_101',
      nativeVertical: true,
      sourceDimensions: { width: 1080, height: 1920 },
      sourceAspectRatio: 9 / 16,
      cropRequired: false,
      cropAmount: 0,
      queryUsed: 'telescope dish',
      broll: {
        id: 'pexels_101',
        url: 'https://pexels.com/v/101',
        videoPath: clip1,
        originalWidth: 1080,
        originalHeight: 1920,
        aspectRatio: 9 / 16,
        durationSeconds: 4,
        relevanceScore: 92,
        source: 'pexels',
        provider: 'pexels',
        providerAssetId: '101',
        nativeVertical: true,
        cropRequired: false,
      },
      inPoint: 0,
      outPoint: halfDuration,
    },
    {
      sceneIndex: 1,
      shotId: 'scene_1_shot_0',
      shotIndex: 0,
      provider: 'pixabay',
      providerAssetId: 'pixabay_202',
      nativeVertical: true,
      sourceDimensions: { width: 1080, height: 1920 },
      sourceAspectRatio: 9 / 16,
      cropRequired: false,
      cropAmount: 0,
      queryUsed: 'pulsar star',
      broll: {
        id: 'pixabay_202',
        url: 'https://pixabay.com/v/202',
        videoPath: clip2,
        originalWidth: 1080,
        originalHeight: 1920,
        aspectRatio: 9 / 16,
        durationSeconds: 4,
        relevanceScore: 95,
        source: 'pixabay',
        provider: 'pixabay',
        providerAssetId: '202',
        nativeVertical: true,
        cropRequired: false,
      },
      inPoint: 0,
      outPoint: remainderDuration,
    },
  ];

  // 4. Assemble multi-shot timeline with burned-in captions
  const timeline = timelineBuilder.buildTimeline(
    scenePlan,
    broll,
    audioPath,
    captions,
    assPath
  );

  // 5. Render final video
  const finalVideoPath = path.join(testDir, 'final-video.mp4');
  const report = await renderer.render(timeline, finalVideoPath);

  assert.ok(fs.existsSync(finalVideoPath), 'Rendered video file does not exist');
  assert.ok(report.fileSizeBytes > 50000, `File size too small: ${report.fileSizeBytes} bytes`);
  assert.ok(report.captionsBurnedIn, 'Report should confirm captions burned in');
  assert.ok(report.captionCount && report.captionCount >= 2, 'Report should record caption count');

  // 6. Deep validation with ffprobe
  const validation = validator.validate(finalVideoPath, timeline.totalDurationSeconds);
  assert.ok(validation.isValid, `Validation failed: ${validation.errors.join(', ')}`);
  assert.ok(validation.checks.validResolution, 'Resolution must be 1080x1920');
  assert.ok(validation.checks.audioSynced, 'Audio stream must be present');
  assert.ok(validation.checks.durationMatch, 'Duration must match within strict tolerance (0.4s)');

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
});
