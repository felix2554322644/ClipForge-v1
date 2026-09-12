import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/config/index';
import { PipelineLogger } from '../src/services/logging/logger';
import { PiperNarrationEngine } from '../src/services/narration/piper';
import { ScenePlanner } from '../src/services/scenes/planner';
import { EditorialEngine } from '../src/services/editorial/editorialEngine';
import { TimelineBuilder } from '../src/services/timeline/builder';
import { CaptionEngine } from '../src/services/captions/captionEngine';
import { MotionApplier } from '../src/services/media/motion';
import { FfmpegRenderer } from '../src/services/rendering/ffmpegRenderer';
import { FfprobeValidator } from '../src/services/validation/ffprobeValidator';
import { BrollCache } from '../src/services/broll/cache';
import { EditingPrimitives } from '../src/services/media/primitives';
import {
  ScriptOutput,
  EditorialPlan,
  EditorialDecision,
} from '../src/types/pipeline';

test('Phase 8 Foundation Reconciliation Suite', async (t) => {
  const testDir = path.join(CONFIG.OUTPUT_DIR, 'test_foundation_reconciliation');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  const logger = new PipelineLogger(testDir);

  await t.test('1. Authoritative Narration Duration Anchoring across entire pipeline', async () => {
    const narrationEngine = new PiperNarrationEngine(logger);
    const audioPath = path.join(testDir, 'recon_narration.wav');
    const speechText = 'Why does your brain freeze when you drink ice cold water? The trigeminal nerve fires rapid pain signals.';
    const audioArtifact = await narrationEngine.synthesizeSpeech(speechText, audioPath);

    assert.ok(fs.existsSync(audioPath), 'Narration audio must exist');
    assert.ok(audioArtifact.durationSeconds > 2.0, 'Audio duration must be measurable');

    const script: ScriptOutput = {
      title: 'Brain Freeze Mystery',
      totalEstimatedSeconds: 30, // Intentionally different from measured duration to test reconciliation
      scenes: [
        {
          index: 0,
          narration: 'Why does your brain freeze when you drink ice cold water?',
          visualDescription: 'Person drinking iced water',
          suggestedKeywords: ['drinking water', 'ice cold glass'],
        },
        {
          index: 1,
          narration: 'The trigeminal nerve fires rapid pain signals.',
          visualDescription: 'Neural pathway animation in human brain',
          suggestedKeywords: ['human brain', 'neural signals'],
        },
      ],
    };

    const scenePlanner = new ScenePlanner(logger);
    const scenePlan = scenePlanner.planScenes(script, audioArtifact.durationSeconds);

    // Assert that planned duration matches actual measured audio duration within rounding margin
    assert.ok(
      Math.abs(scenePlan.totalDurationSeconds - audioArtifact.durationSeconds) < 0.05,
      `Scene plan duration (${scenePlan.totalDurationSeconds}) must strictly equal authoritative narration duration (${audioArtifact.durationSeconds})`
    );

    const editorialEngine = new EditorialEngine(logger);
    const editorialPlan = editorialEngine.makeEditorialDecisions({
      script,
      scenePlan,
      brollSelections: [],
      totalDurationSeconds: audioArtifact.durationSeconds,
    });

    const sumDecisions = Math.round(
      editorialPlan.decisions.reduce((acc, d) => acc + d.durationSeconds, 0) * 100
    ) / 100;
    assert.ok(
      Math.abs(sumDecisions - audioArtifact.durationSeconds) < 0.05,
      `Editorial plan decision durations (${sumDecisions}) must strictly sum to narration duration (${audioArtifact.durationSeconds})`
    );
  });

  await t.test('2. EditorialDecision fields properly propagate into Timeline and Filter Graphs', async () => {
    const decisions: EditorialDecision[] = [
      {
        shotId: 'shot_0',
        sceneIndex: 0,
        shotIndex: 0,
        role: 'hook',
        narrationClause: 'Why does your brain freeze',
        durationSeconds: 2.5,
        sourceDurationSeconds: 4.0,
        inPoint: 1.0,
        outPoint: 3.5,
        motionEffect: 'zoom_in',
        motionIntensity: 'dramatic',
        cropMode: 'punch_in',
        transition: 'flash',
        captionTreatment: 'hook_pop',
        patternInterrupt: {
          type: 'punch_in',
          intensity: 'bold',
        },
        editorialReason: 'Punchy hook introduction',
        pacingWeight: 1.2,
        videoSourcePath: path.join(testDir, 'sample1.mp4'),
      },
      {
        shotId: 'shot_1',
        sceneIndex: 1,
        shotIndex: 0,
        role: 'statistic',
        narrationClause: 'Neural signals explode',
        durationSeconds: 3.0,
        sourceDurationSeconds: 4.0,
        inPoint: 0.5,
        outPoint: 3.5,
        motionEffect: 'pan_left',
        motionIntensity: 'subtle',
        cropMode: 'tight',
        transition: 'fade',
        captionTreatment: 'statistic_callout',
        editorialReason: 'Highlight neural signals with tight framing',
        pacingWeight: 1.0,
        videoSourcePath: path.join(testDir, 'sample2.mp4'),
      },
    ];

    const plan: EditorialPlan = {
      totalDurationSeconds: 5.5,
      decisions,
      pacingBreakdown: {
        hookDuration: 2.5,
        averageShotDuration: 2.75,
        shotCount: 2,
        rapidShotsCount: 0,
        holdsCount: 1,
        staticHoldsCount: 0,
      },
      varietyScore: 85,
      patternInterruptCount: 1,
    };

    const timelineBuilder = new TimelineBuilder(logger);
    const captionEngine = new CaptionEngine(logger);
    const assPath = path.join(testDir, 'recon_captions.ass');

    const { segments: captions, assPath: outAss } = captionEngine.generateCaptions(
      'Why does your brain freeze Neural signals explode',
      5.5,
      assPath,
      plan
    );

    const timeline = timelineBuilder.buildTimelineFromEditorial(
      plan,
      path.join(testDir, 'dummy_narration.wav'),
      captions,
      outAss
    );

    // Verify all fields are present on timeline cuts
    assert.equal(timeline.cuts.length, 2);
    assert.equal(timeline.cuts[0].inPoint, 1.0);
    assert.equal(timeline.cuts[0].outPoint, 3.5);
    assert.equal(timeline.cuts[0].motionIntensity, 'dramatic');
    assert.equal(timeline.cuts[0].cropMode, 'punch_in');
    assert.equal(timeline.cuts[0].transition, 'flash');
    assert.equal(timeline.cuts[0].captionTreatment, 'hook_pop');

    assert.equal(timeline.cuts[1].inPoint, 0.5);
    assert.equal(timeline.cuts[1].outPoint, 3.5);
    assert.equal(timeline.cuts[1].motionIntensity, 'subtle');
    assert.equal(timeline.cuts[1].cropMode, 'tight');
    assert.equal(timeline.cuts[1].transition, 'fade');
    assert.equal(timeline.cuts[1].captionTreatment, 'statistic_callout');

    // Verify MotionApplier generates corresponding filter parameters
    const params1 = MotionApplier.getMotionParameters(
      timeline.cuts[0].motionEffect,
      timeline.cuts[0].cropMode,
      timeline.cuts[0].motionIntensity
    );
    assert.ok(params1.startScale >= 1.15, 'Punch-in must have >= 1.15 scale');
    assert.ok(params1.maxScale > params1.startScale, 'Dramatic zoom in must animate scale');

    const filter1 = MotionApplier.buildMotionFilter(
      timeline.cuts[0].motionEffect,
      timeline.cuts[0].durationSeconds,
      timeline.fps,
      timeline.width,
      timeline.height,
      timeline.cuts[0].cropMode,
      timeline.cuts[0].transition,
      timeline.cuts[0].motionIntensity
    );
    assert.ok(filter1.includes('fade=t=in:st=0:d=0.15:color=white'), 'Flash transition must generate white fade');

    const filter2 = MotionApplier.buildMotionFilter(
      timeline.cuts[1].motionEffect,
      timeline.cuts[1].durationSeconds,
      timeline.fps,
      timeline.width,
      timeline.height,
      timeline.cuts[1].cropMode,
      timeline.cuts[1].transition,
      timeline.cuts[1].motionIntensity
    );
    assert.ok(filter2.includes('fade=t=in:st=0:d=0.20'), 'Fade transition must generate fade filter');

    // Verify ASS subtitle file contains treatment styling
    const assContent = fs.readFileSync(assPath, 'utf-8');
    assert.ok(assContent.includes('Dialogue: 0,'), 'ASS file must have dialog events');
    assert.ok(assContent.includes('SocialCaptions'), 'ASS file must reference SocialCaptions style');
  });

  await t.test('3. B-roll caching disk storage and cross-run reuse', async () => {
    const cache = new BrollCache();
    const sampleClip = path.join(testDir, 'cache_seed.mp4');
    EditingPrimitives.generateProceduralFootage(sampleClip, 2.0, 'cache_test', 1080, 1920, 30);

    const testKey = 'test_pixabay_brain_waves_123';
    const cachedPath = cache.set(testKey, sampleClip, 2.0, 'brain waves');

    assert.ok(fs.existsSync(cachedPath), 'Cache must store video artifact on disk');

    // Test retrieval in second cache instance (simulating cross-run persistence)
    const newCacheInstance = new BrollCache();
    const retrieved = newCacheInstance.get(testKey);

    assert.ok(retrieved !== null, 'Cache must find previously cached item');
    assert.ok(fs.existsSync(retrieved!), 'Retrieved cache path must exist on disk');
  });

  await t.test('4. End-to-End Composite Render with strict duration reconciliation', async () => {
    const narrationEngine = new PiperNarrationEngine(logger);
    const captionEngine = new CaptionEngine(logger);
    const timelineBuilder = new TimelineBuilder(logger);
    const renderer = new FfmpegRenderer(logger);
    const validator = new FfprobeValidator(logger);

    const speechText = 'The human brain makes thousands of subconscious choices before you realize.';
    const audioPath = path.join(testDir, 'e2e_recon_audio.wav');
    const audioArtifact = await narrationEngine.synthesizeSpeech(speechText, audioPath);

    const totalDur = audioArtifact.durationSeconds;
    const half = Math.round((totalDur / 2) * 100) / 100;
    const remainder = Math.round((totalDur - half) * 100) / 100;

    const clipA = path.join(testDir, 'e2e_clipA.mp4');
    const clipB = path.join(testDir, 'e2e_clipB.mp4');
    EditingPrimitives.generateProceduralFootage(clipA, 4.0, 'crowd', 1080, 1920, 30);
    EditingPrimitives.generateProceduralFootage(clipB, 4.0, 'subway', 1080, 1920, 30);

    const plan: EditorialPlan = {
      totalDurationSeconds: totalDur,
      decisions: [
        {
          shotId: 'shot_0',
          sceneIndex: 0,
          shotIndex: 0,
          role: 'hook',
          narrationClause: 'The human brain makes thousands of subconscious choices',
          durationSeconds: half,
          sourceDurationSeconds: 4.0,
          inPoint: 0.2,
          outPoint: Math.round((0.2 + half) * 100) / 100,
          motionEffect: 'zoom_in',
          motionIntensity: 'moderate',
          cropMode: 'punch_in',
          transition: 'cut',
          captionTreatment: 'hook_pop',
          editorialReason: 'Intriguing subconscious hook',
          pacingWeight: 1.2,
          videoSourcePath: clipA,
        },
        {
          shotId: 'shot_1',
          sceneIndex: 1,
          shotIndex: 0,
          role: 'payoff',
          narrationClause: 'before you realize.',
          durationSeconds: remainder,
          sourceDurationSeconds: 4.0,
          inPoint: 0.4,
          outPoint: Math.round((0.4 + remainder) * 100) / 100,
          motionEffect: 'pan_right',
          motionIntensity: 'subtle',
          cropMode: 'standard',
          transition: 'fade',
          captionTreatment: 'payoff_impact',
          editorialReason: 'Payoff impact hold',
          pacingWeight: 1.0,
          videoSourcePath: clipB,
        },
      ],
      pacingBreakdown: {
        hookDuration: half,
        averageShotDuration: (half + remainder) / 2,
        shotCount: 2,
        rapidShotsCount: 0,
        holdsCount: 1,
        staticHoldsCount: 0,
      },
      varietyScore: 80,
      patternInterruptCount: 0,
    };

    const assPath = path.join(testDir, 'e2e_recon_captions.ass');
    const { segments: captions, assPath: outAss } = captionEngine.generateCaptions(
      speechText,
      totalDur,
      assPath,
      plan
    );

    const timeline = timelineBuilder.buildTimelineFromEditorial(
      plan,
      audioPath,
      captions,
      outAss
    );

    const outVideoPath = path.join(testDir, 'final_reconciliation_render.mp4');
    const renderResult = await renderer.render(timeline, outVideoPath);

    assert.ok(renderResult.fileSizeBytes > 0, 'Render output size must be > 0');
    assert.ok(fs.existsSync(renderResult.outputPath), 'Rendered MP4 must exist');

    const validation = validator.validate(outVideoPath, totalDur);
    assert.ok(validation.isValid, `Validation must pass: ${validation.errors.join(', ')}`);
    assert.ok(validation.checks.durationMatch, 'Duration must match within strict tolerance');
    assert.ok(validation.checks.validResolution, 'Resolution must be 1080x1920');
    assert.ok(validation.checks.validFramerate, 'Framerate must be 30 FPS');
    assert.ok(validation.checks.audioSynced, 'Audio must be multiplexed and synced');
  });
});
