import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CaptionEngine, DEFAULT_CAPTION_THEME } from '../captionEngine';
import { PlaywrightSceneRenderer } from '../../visuals/renderer';
import { AIDirectorValidator } from '../../editorial/validator';
import { PipelineLogger } from '../../logging/logger';

const logger = new PipelineLogger();

test('CaptionEngine: exact narration synchronization and duration matching', () => {
  const engine = new CaptionEngine(logger);
  const narration = 'Inside a magnetar, magnetic fields are a quadrillion times stronger than Earth.';
  const duration = 5.0;

  const result = engine.generateCaptions(narration, duration);
  assert.ok(result.segments.length > 0, 'Must generate caption segments');
  
  const lastSeg = result.segments[result.segments.length - 1];
  assert.equal(lastSeg.endTime, duration, 'Final caption segment end time must match total duration exactly');
});

test('CaptionEngine: treatment selection and editorial plans mapping', () => {
  const engine = new CaptionEngine(logger);
  const narration = 'A single teaspoon would weigh a billion tons.';
  const duration = 3.5;
  const assPath = path.join('/tmp', `captions_${Date.now()}.ass`);

  const editorialPlan = {
    totalDurationSeconds: 3.5,
    format: 'short' as const,
    decisions: [
      {
        shotId: 'shot_1',
        sceneIndex: 0,
        shotIndex: 0,
        role: 'statistic' as const,
        narrationClause: 'A single teaspoon would weigh a billion tons.',
        durationSeconds: 3.5,
        videoSourcePath: '/tmp/test.mp4',
        sourceDurationSeconds: 5.0,
        inPoint: 0,
        outPoint: 3.5,
        motionEffect: 'zoom_in' as const,
        motionIntensity: 'moderate' as const,
        cropMode: 'standard' as const,
        transition: 'cut' as const,
        captionTreatment: 'statistic_callout' as const,
        editorialReason: 'Statistic callout for weight',
        pacingWeight: 1.0,
      },
    ],
    pacingBreakdown: {
      hookDuration: 3.5,
      averageShotDuration: 3.5,
      shotCount: 1,
      rapidShotsCount: 0,
      holdsCount: 1,
      staticHoldsCount: 0,
    },
    varietyScore: 80,
    visualContinuityScore: 90,
    compositionVarietyScore: 85,
    repetitionPenalties: 0,
    patternInterruptCount: 0,
    editorialNarrativeArc: 'Test arc',
  };

  const result = engine.generateCaptions(narration, duration, assPath, editorialPlan);
  assert.ok(result.assPath, 'Must output ASS file path');
  const assContent = fs.readFileSync(assPath, 'utf-8');
  assert.ok(assContent.includes('StatisticCaptions') || assContent.includes('SocialCaptions'), 'ASS file must contain valid styles');
  assert.ok(assContent.includes('bilion') || assContent.includes('billion') || assContent.includes('tons'), 'ASS file must contain narration text');
});

test('CaptionEngine: emphasis phrase handling and word-level highlighting', () => {
  const engine = new CaptionEngine(logger);
  const detection = engine.detectEmphasis('Inside a MAGNETAR, 10,000 times powerful.');
  assert.equal(detection.hasEmphasis, true, 'Must detect emphasis');
  assert.ok(detection.emphasisWords.includes('MAGNETAR') || detection.emphasisWords.includes('magnetar'), 'Must identify magnetar');
  assert.ok(detection.emphasisWords.includes('10000') || detection.emphasisWords.includes('10,000'), 'Must identify number');
});

test('CaptionEngine: deterministic animation and safe positioning defaults', () => {
  const theme = DEFAULT_CAPTION_THEME;
  assert.equal(theme.marginVertical, 520, 'Must adhere to 9:16 caption-safe vertical margin');
  assert.equal(theme.animationFadeMs, 70, 'Must have fast punchy fade animation duration');
});

test('PlaywrightSceneRenderer: 9:16 and 16:9 typography scene integration', async () => {
  const renderer = new PlaywrightSceneRenderer(logger);
  
  const verticalResult = await renderer.renderScene({
    sceneParams: {
      type: 'kinetic_typography',
      headline: 'A TRILLION TIMES',
      accentColor: '#F5A623',
    },
    format: 'short',
    durationSeconds: 3.0,
  });

  assert.equal(verticalResult.width, 1080, 'Vertical short format width must be 1080px');
  assert.equal(verticalResult.height, 1920, 'Vertical short format height must be 1920px');

  const landscapeResult = await renderer.renderScene({
    sceneParams: {
      type: 'statistic_card',
      statValue: '1 Billion Tons',
      statLabel: 'Weight of 1 Teaspoon of Neutron Star',
      accentColor: '#F5A623',
    },
    format: 'long',
    durationSeconds: 3.0,
  });

  assert.equal(landscapeResult.width, 1920, 'Landscape long format width must be 1920px');
  assert.equal(landscapeResult.height, 1080, 'Landscape long format height must be 1080px');
});

test('AIDirectorValidator: validates caption treatments and handles invalid Director output', () => {
  const validator = new AIDirectorValidator();
  const input = {
    candidateBoard: {
      candidates: [
        {
          id: 'cand_1',
          provider: 'pexels',
          downloadUrl: '/tmp/cand1.mp4',
          durationSeconds: 10.0,
          width: 1080,
          height: 1920,
          aspectRatio: 1080 / 1920,
          nativeVertical: true,
          tags: ['space'],
          queryUsed: 'space',
        },
      ],
      totalCandidates: 1,
      queriesRun: ['space'],
      previouslySelectedAssetIds: [],
    },
    format: 'short' as const,
    narrationText: 'Space is vast and mysterious.',
    narrationDurationSeconds: 3.0,
    targetDurationSeconds: 3.0,
    storyboard: {
      title: 'Test',
      format: 'short' as const,
      totalShots: 1,
      generatedBy: 'gemini' as const,
      shots: [
        {
          shotId: 's1',
          sceneIndex: 0,
          shotIndex: 0,
          narrationStart: 0,
          narrationEnd: 3.0,
          durationSeconds: 3.0,
          narrationClause: 'Space is vast and mysterious.',
          visualSubject: 'Nebula',
          action: 'Drifting',
          environment: 'Space',
          emotion: 'Awe',
          framing: 'Wide',
          cameraMovement: 'Static',
          visualPurpose: 'Hook',
          visualPriority: 'high',
          preferredVisualType: 'stock',
          searchQueries: ['space'],
        },
      ],
      totalDurationSeconds: 3.0,
    },
  } as any;

  // Test invalid raw plan with invalid caption treatment -> validator should sanitize it safely
  const invalidPlan = {
    decisions: [
      {
        shotId: 's1',
        selectedCandidateId: 'cand_1',
        role: 'invalid_role',
        captionTreatment: 'invalid_treatment',
        durationSeconds: 3.0,
        narrationClause: 'Space is vast and mysterious.',
      },
    ],
  };

  const sanitized = validator.validateAndSanitize(invalidPlan, input);
  assert.ok(sanitized, 'Validator must produce sanitized fallback plan');
  assert.equal(sanitized.decisions[0].captionTreatment, 'hook_pop', 'Invalid treatment must be sanitized to valid default');
});
