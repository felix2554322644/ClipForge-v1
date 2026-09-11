import test from 'node:test';
import assert from 'node:assert/strict';
import { AIDirectorService } from '../src/services/editorial/director';
import { AIDirectorValidator } from '../src/services/editorial/validator';
import { VisualIntelligenceService } from '../src/services/editorial/visualIntelligence';
import {
  CLIPFORGE_NICHE_PROFILE,
  SHORT_FORM_PROFILE,
  LONG_FORM_PROFILE,
  getFormatProfile,
} from '../src/services/editorial/profiles';
import {
  AIDirectorInput,
  BrollCandidateBoard,
  CandidateBrollAsset,
  EditorialPlan,
} from '../src/types/editorial';
import { TimelineBuilder } from '../src/services/timeline/builder';
import { PipelineLogger } from '../src/services/logging/logger';
import { ScenePlanOutput, ScriptOutput } from '../src/types/pipeline';

const logger = new PipelineLogger();

function createMockCandidate(overrides: Partial<CandidateBrollAsset> = {}): CandidateBrollAsset {
  return {
    id: overrides.id || 'pexels_12345',
    provider: overrides.provider || 'pexels',
    providerAssetId: overrides.providerAssetId || '12345',
    sourceUrl: overrides.sourceUrl || 'https://pexels.com/video/12345',
    downloadUrl: overrides.downloadUrl || '/tmp/pexels_12345.mp4',
    durationSeconds: overrides.durationSeconds !== undefined ? overrides.durationSeconds : 8.0,
    width: overrides.width || 1080,
    height: overrides.height || 1920,
    aspectRatio: overrides.aspectRatio || 1080 / 1920,
    nativeVertical: overrides.nativeVertical !== undefined ? overrides.nativeVertical : true,
    tags: overrides.tags || ['space', 'galaxy', 'stars'],
    queryUsed: overrides.queryUsed || 'deep space galaxy',
    targetSceneIndex: overrides.targetSceneIndex !== undefined ? overrides.targetSceneIndex : 0,
    targetShotId: overrides.targetShotId || 'shot_0',
    relevanceScore: overrides.relevanceScore !== undefined ? overrides.relevanceScore : 92,
    semanticDescription: overrides.semanticDescription || 'Ultra-HD galaxy cluster spinning in deep space',
    thumbnailUrl: overrides.thumbnailUrl || 'https://images.pexels.com/videos/12345/thumb.jpg',
  };
}

function createMockBoard(candidates?: CandidateBrollAsset[]): BrollCandidateBoard {
  const cList =
    candidates || [
      createMockCandidate({
        id: 'candidate_galaxy_1',
        providerAssetId: 'p_101',
        durationSeconds: 7.0,
        targetSceneIndex: 0,
      }),
      createMockCandidate({
        id: 'candidate_nebula_2',
        providerAssetId: 'p_102',
        durationSeconds: 6.0,
        targetSceneIndex: 1,
      }),
      createMockCandidate({
        id: 'candidate_telescope_3',
        providerAssetId: 'p_103',
        durationSeconds: 10.0,
        targetSceneIndex: 2,
      }),
      createMockCandidate({
        id: 'candidate_blackhole_4',
        providerAssetId: 'p_104',
        durationSeconds: 5.5,
        targetSceneIndex: 3,
      }),
    ];

  return {
    candidates: cList,
    totalCandidates: cList.length,
    queriesRun: ['deep space galaxy', 'starry nebula universe'],
    previouslySelectedAssetIds: [],
  };
}

const mockFullNarration =
  'Inside a magnetar, magnetic fields are a quadrillion times stronger than Earth. A single teaspoon would weigh a billion tons. Follow ClipForge for mind-bending physics.';

function createMockScript(): ScriptOutput {
  return {
    title: 'Magnetars',
    estimatedDurationSeconds: 12.0,
    hook: 'Inside a magnetar, magnetic fields are a quadrillion times stronger than Earth.',
    coreMystery: 'A single teaspoon would weigh a billion tons.',
    closingCall: 'Follow ClipForge for mind-bending physics.',
    scenes: [
      {
        index: 0,
        narration: 'Inside a magnetar, magnetic fields are a quadrillion times stronger than Earth.',
      },
      {
        index: 1,
        narration: 'A single teaspoon would weigh a billion tons.',
      },
      {
        index: 2,
        narration: 'Follow ClipForge for mind-bending physics.',
      },
    ],
  };
}

function createMockScenePlan(): ScenePlanOutput {
  return {
    totalDurationSeconds: 12.0,
    scenes: [
      {
        index: 0,
        narration: 'Inside a magnetar, magnetic fields are a quadrillion times stronger than Earth.',
        durationSeconds: 4.5,
        brollQuery: ['magnetar neutron star'],
        motionEffect: 'zoom_in',
        captionText: 'Inside a magnetar, fields are a quadrillion times stronger.',
        shots: [
          {
            id: 'scene_0_shot_0',
            sceneIndex: 0,
            shotIndex: 0,
            narrationClause: 'Inside a magnetar',
            durationSeconds: 2.0,
            pacingType: 'fast',
            brollQueries: ['magnetar star core'],
            motionEffect: 'punch_in',
            transition: 'cut',
            captionText: 'Inside a magnetar',
          },
          {
            id: 'scene_0_shot_1',
            sceneIndex: 0,
            shotIndex: 1,
            narrationClause: 'fields are a quadrillion times stronger than Earth.',
            durationSeconds: 2.5,
            pacingType: 'normal',
            brollQueries: ['magnetic energy field space'],
            motionEffect: 'zoom_in',
            transition: 'cut',
            captionText: 'fields are a quadrillion times stronger',
          },
        ],
      },
      {
        index: 1,
        narration: 'A single teaspoon would weigh a billion tons.',
        durationSeconds: 4.0,
        brollQuery: ['neutron star density scale'],
        motionEffect: 'pan_left',
        captionText: 'A single teaspoon would weigh a billion tons.',
        shots: [
          {
            id: 'scene_1_shot_0',
            sceneIndex: 1,
            shotIndex: 0,
            narrationClause: 'A single teaspoon would weigh a billion tons.',
            durationSeconds: 4.0,
            pacingType: 'normal',
            brollQueries: ['heavy metal density physics'],
            motionEffect: 'pan_left',
            transition: 'cut',
            captionText: 'A single teaspoon would weigh a billion tons.',
          },
        ],
      },
      {
        index: 2,
        narration: 'Follow ClipForge for mind-bending physics.',
        durationSeconds: 3.5,
        brollQuery: ['deep space cosmos'],
        motionEffect: 'pull_out',
        captionText: 'Follow ClipForge for mind-bending physics.',
        shots: [
          {
            id: 'scene_2_shot_0',
            sceneIndex: 2,
            shotIndex: 0,
            narrationClause: 'Follow ClipForge for mind-bending physics.',
            durationSeconds: 3.5,
            pacingType: 'normal',
            brollQueries: ['deep space galaxy cosmos'],
            motionEffect: 'pull_out',
            transition: 'fade',
            captionText: 'Follow ClipForge for mind-bending physics.',
          },
        ],
      },
    ],
  };
}

// 1. Valid Director output
test('AI Editorial Director: generates valid structured EditorialPlan from Gemini response', async () => {
  const board = createMockBoard();
  const script = createMockScript();
  const scenePlan = createMockScenePlan();

  const mockGemini = {
    isAvailable: () => true,
    generateJson: async <T>() => {
      return {
        totalDurationSeconds: 12.0,
        editorialNarrativeArc: 'Hook with punch-in, escalate through density fact, conclude with payoff',
        decisions: [
          {
            shotId: 'shot_hook',
            sceneIndex: 0,
            shotIndex: 0,
            selectedCandidateId: 'candidate_galaxy_1',
            narrationClause: 'Inside a magnetar',
            inPoint: 0.5,
            outPoint: 2.5,
            durationSeconds: 2.0,
            role: 'hook',
            motionEffect: 'punch_in',
            motionIntensity: 'dramatic',
            cropMode: 'punch_in',
            transition: 'cut',
            captionTreatment: 'hook_pop',
            patternInterrupt: {
              type: 'punch_in',
              label: 'Magnetar Core',
              intensity: 'bold',
            },
            editorialReason: 'Intense hook visual cut',
            pacingWeight: 1.3,
          },
          {
            shotId: 'shot_escalation',
            sceneIndex: 0,
            shotIndex: 1,
            selectedCandidateId: 'candidate_nebula_2',
            narrationClause: 'magnetic fields are a quadrillion times stronger',
            inPoint: 1.0,
            outPoint: 3.5,
            durationSeconds: 2.5,
            role: 'escalation',
            motionEffect: 'push_in',
            motionIntensity: 'moderate',
            cropMode: 'standard',
            transition: 'cut',
            captionTreatment: 'standard',
            editorialReason: 'Escalation to highlight immense power',
            pacingWeight: 1.0,
          },
          {
            shotId: 'shot_stat',
            sceneIndex: 1,
            shotIndex: 0,
            selectedCandidateId: 'candidate_telescope_3',
            narrationClause: 'A single teaspoon would weigh a billion tons',
            inPoint: 2.0,
            outPoint: 6.0,
            durationSeconds: 4.0,
            role: 'statistic',
            motionEffect: 'static',
            motionIntensity: 'subtle',
            cropMode: 'standard',
            transition: 'cut',
            captionTreatment: 'statistic_callout',
            patternInterrupt: {
              type: 'statistic_callout',
              label: '1 Billion Tons',
              intensity: 'bold',
            },
            editorialReason: 'Static hold allows viewer to absorb the staggering number',
            pacingWeight: 0.8,
          },
          {
            shotId: 'shot_payoff',
            sceneIndex: 2,
            shotIndex: 0,
            selectedCandidateId: 'candidate_blackhole_4',
            narrationClause: 'Follow ClipForge for mind-bending physics',
            inPoint: 0.0,
            outPoint: 3.5,
            durationSeconds: 3.5,
            role: 'payoff',
            motionEffect: 'pull_out',
            motionIntensity: 'moderate',
            cropMode: 'standard',
            transition: 'fade',
            captionTreatment: 'payoff_impact',
            editorialReason: 'Cinematic wide pull-out for concluding call to action',
            pacingWeight: 1.0,
          },
        ],
      } as unknown as T;
    },
  };

  const director = new AIDirectorService({ geminiClient: mockGemini as any, logger });

  const input: AIDirectorInput = {
    nicheProfile: CLIPFORGE_NICHE_PROFILE,
    format: 'short',
    targetDurationSeconds: 12.0,
    script,
    narrationText: mockFullNarration,
    narrationDurationSeconds: 12.0,
    scenePlan,
    candidateBoard: board,
  };

  const plan = await director.directVideo(input);

  assert.ok(plan);
  assert.equal(plan.decisions.length, 4);
  assert.equal(plan.totalDurationSeconds, 12.0);
  assert.equal(plan.decisions[0].role, 'hook');
  assert.equal(plan.decisions[0].selectedCandidateId, 'candidate_galaxy_1');
  assert.equal(plan.decisions[0].motionEffect, 'punch_in');
  assert.equal(plan.decisions[2].captionTreatment, 'statistic_callout');
  assert.equal(plan.decisions[2].motionEffect, 'static');
  assert.ok(plan.pacingBreakdown.shotCount === 4);
  assert.ok(plan.varietyScore > 50);
});

// 2. Schema validation
test('AI Editorial Director Validator: rejects invalid non-object schema and triggers fallback', () => {
  const validator = new AIDirectorValidator();
  const board = createMockBoard();
  const input: AIDirectorInput = {
    targetDurationSeconds: 10.0,
    narrationText: 'Test narration clause.',
    narrationDurationSeconds: 10.0,
    candidateBoard: board,
  };

  // Not an object
  const nullResult = validator.validateAndSanitize(null, input);
  assert.equal(nullResult, null);

  // String instead of object
  const stringResult = validator.validateAndSanitize('invalid json string', input);
  assert.equal(stringResult, null);

  // Missing decisions array
  const noDecisions = validator.validateAndSanitize({ totalDurationSeconds: 10.0 }, input);
  assert.equal(noDecisions, null);

  // Empty decisions array
  const emptyDecisions = validator.validateAndSanitize({ decisions: [] }, input);
  assert.equal(emptyDecisions, null);
});

// 3. Nonexistent candidate rejection
test('AI Editorial Director Validator: rejects nonexistent candidate IDs and remaps safely', () => {
  const validator = new AIDirectorValidator();
  const board = createMockBoard();
  const input: AIDirectorInput = {
    targetDurationSeconds: 6.0,
    narrationText: 'Test narration clause.',
    narrationDurationSeconds: 6.0,
    candidateBoard: board,
  };

  const rawPlan = {
    decisions: [
      {
        shotId: 'shot_hallucinated',
        sceneIndex: 0,
        selectedCandidateId: 'hallucinated_stock_id_does_not_exist_9999',
        durationSeconds: 3.0,
        inPoint: 0,
        outPoint: 3.0,
      },
      {
        shotId: 'shot_valid',
        sceneIndex: 1,
        selectedCandidateId: 'candidate_nebula_2',
        durationSeconds: 3.0,
        inPoint: 0,
        outPoint: 3.0,
      },
    ],
  };

  const plan = validator.validateAndSanitize(rawPlan, input);
  assert.ok(plan);
  assert.equal(plan.decisions.length, 2);

  // First decision must NOT have the hallucinated ID; it was remapped to a valid board candidate
  assert.notEqual(plan.decisions[0].selectedCandidateId, 'hallucinated_stock_id_does_not_exist_9999');
  const validIds = new Set(board.candidates.map((c) => c.id));
  assert.ok(validIds.has(plan.decisions[0].selectedCandidateId!));

  // Second decision kept its valid candidate
  assert.equal(plan.decisions[1].selectedCandidateId, 'candidate_nebula_2');

  const issues = validator.getIssues();
  assert.ok(issues.some((i) => i.issue.includes('does not exist on candidate board')));
});

// 4. Invalid time-range rejection
test('AI Editorial Director Validator: clamps negative inPoint and outPoint exceeding asset duration', () => {
  const validator = new AIDirectorValidator();
  const candidate = createMockCandidate({
    id: 'cand_short',
    durationSeconds: 4.0, // only 4 seconds long
  });
  const board = createMockBoard([candidate]);
  const input: AIDirectorInput = {
    targetDurationSeconds: 4.0,
    narrationText: 'Test narration clause.',
    narrationDurationSeconds: 4.0,
    candidateBoard: board,
  };

  const rawPlan = {
    decisions: [
      {
        shotId: 'shot_clamp',
        sceneIndex: 0,
        selectedCandidateId: 'cand_short',
        inPoint: -3.5, // Negative inPoint
        outPoint: 25.0, // Exceeds candidate duration (4.0s)
        durationSeconds: 28.5,
      },
    ],
  };

  const plan = validator.validateAndSanitize(rawPlan, input);
  assert.ok(plan);
  const d = plan.decisions[0];

  assert.ok(d.inPoint >= 0, `inPoint must be >= 0, got ${d.inPoint}`);
  assert.ok(d.outPoint <= candidate.durationSeconds, `outPoint must be <= 4.0, got ${d.outPoint}`);
  assert.equal(Math.round((d.outPoint - d.inPoint) * 100) / 100, d.durationSeconds);
});

// 5. Duration constraints & exact normalization
test('AI Editorial Director Validator: clamps shot durations and normalizes sum to target', () => {
  const validator = new AIDirectorValidator();
  const board = createMockBoard();
  const targetDuration = 10.0;
  const input: AIDirectorInput = {
    format: 'short',
    targetDurationSeconds: targetDuration,
    narrationText: 'Test narration clause.',
    narrationDurationSeconds: targetDuration,
    candidateBoard: board,
  };

  // Gemini returns shots that sum to 18.0 seconds instead of 10.0 seconds
  const rawPlan = {
    decisions: [
      {
        shotId: 'shot_1',
        sceneIndex: 0,
        selectedCandidateId: 'candidate_galaxy_1',
        durationSeconds: 6.0, // too long for short-form hook!
      },
      {
        shotId: 'shot_2',
        sceneIndex: 1,
        selectedCandidateId: 'candidate_nebula_2',
        durationSeconds: 6.0,
      },
      {
        shotId: 'shot_3',
        sceneIndex: 2,
        selectedCandidateId: 'candidate_telescope_3',
        durationSeconds: 6.0,
      },
    ],
  };

  const plan = validator.validateAndSanitize(rawPlan, input);
  assert.ok(plan);
  assert.equal(plan.totalDurationSeconds, 10.0);

  const sum = plan.decisions.reduce((acc, d) => acc + d.durationSeconds, 0);
  assert.ok(
    Math.abs(sum - targetDuration) < 0.02,
    `Sum of durations ${sum} must match target ${targetDuration}`
  );

  // Hook shot must satisfy short-form hook constraint (<= hookDurationMax 2.8s)
  assert.ok(
    plan.decisions[0].durationSeconds <= SHORT_FORM_PROFILE.hookDurationMax + 0.1,
    `Hook duration was ${plan.decisions[0].durationSeconds}`
  );
});

// 6. Format profile selection
test('Format Editorial Profiles: selects correct profile parameters for short-form and long-form', () => {
  const shortProfile = getFormatProfile('short');
  assert.equal(shortProfile.format, 'short');
  assert.equal(shortProfile.aspectRatio, '9:16');
  assert.ok(shortProfile.allowFrequentVisualChanges);
  assert.ok(shortProfile.shotDurationRange.max <= 3.8);
  assert.ok(shortProfile.hookDurationMax <= 2.8);

  const longProfile = getFormatProfile('long');
  assert.equal(longProfile.format, 'long');
  assert.ok(!longProfile.allowFrequentVisualChanges);
  assert.ok(longProfile.shotDurationRange.max >= 6.0);
  assert.ok(longProfile.patternInterruptCooldownSeconds >= 20.0);

  // Default fallback to short-form
  const defaultProfile = getFormatProfile(undefined);
  assert.equal(defaultProfile.format, 'short');
});

// 7. Fallback when Gemini fails
test('AI Editorial Director Service: seamlessly falls back to deterministic engine when Gemini throws', async () => {
  const board = createMockBoard();
  const script = createMockScript();
  const scenePlan = createMockScenePlan();

  const failingGemini = {
    isAvailable: () => true,
    generateJson: async () => {
      throw new Error('API key quota exhausted (429 ResourceExhausted)');
    },
  };

  const director = new AIDirectorService({ geminiClient: failingGemini as any, logger });

  const input: AIDirectorInput = {
    targetDurationSeconds: 12.0,
    script,
    narrationText: mockFullNarration,
    narrationDurationSeconds: 12.0,
    scenePlan,
    candidateBoard: board,
  };

  const plan = await director.directVideo(input);

  assert.ok(plan);
  assert.ok(plan.decisions.length > 0);
  assert.equal(plan.totalDurationSeconds, 12.0);
  assert.ok(plan.decisions[0].videoSourcePath.length > 0);
  assert.equal(plan.decisions[0].role, 'hook');
});

// 8. Fallback when Gemini returns invalid JSON / null
test('AI Editorial Director Service: falls back to deterministic engine when Gemini returns empty or null', async () => {
  const board = createMockBoard();
  const script = createMockScript();
  const scenePlan = createMockScenePlan();

  const brokenGemini = {
    isAvailable: () => true,
    generateJson: async () => {
      return null;
    },
  };

  const director = new AIDirectorService({ geminiClient: brokenGemini as any, logger });

  const input: AIDirectorInput = {
    targetDurationSeconds: 12.0,
    script,
    narrationText: mockFullNarration,
    narrationDurationSeconds: 12.0,
    scenePlan,
    candidateBoard: board,
  };

  const plan = await director.directVideo(input);

  assert.ok(plan);
  assert.ok(plan.decisions.length > 0);
  assert.equal(plan.totalDurationSeconds, 12.0);
});

// 9. Duplicate asset protection
test('AI Editorial Director Validator: shifts intervals on reused candidate assets to prevent frame duplicate', () => {
  const validator = new AIDirectorValidator();
  const candidate = createMockCandidate({
    id: 'reused_asset',
    durationSeconds: 10.0,
  });
  const board = createMockBoard([candidate]);
  const input: AIDirectorInput = {
    targetDurationSeconds: 6.0,
    narrationText: 'Test narration clause.',
    narrationDurationSeconds: 6.0,
    candidateBoard: board,
  };

  const rawPlan = {
    decisions: [
      {
        shotId: 'shot_1',
        sceneIndex: 0,
        selectedCandidateId: 'reused_asset',
        inPoint: 0.0,
        outPoint: 3.0,
        durationSeconds: 3.0,
      },
      {
        shotId: 'shot_2',
        sceneIndex: 1,
        selectedCandidateId: 'reused_asset',
        inPoint: 0.0, // Reuses exact same time range!
        outPoint: 3.0,
        durationSeconds: 3.0,
      },
    ],
  };

  const plan = validator.validateAndSanitize(rawPlan, input);
  assert.ok(plan);

  const d1 = plan.decisions[0];
  const d2 = plan.decisions[1];

  assert.equal(d1.selectedCandidateId, 'reused_asset');
  // d2 inPoint must have been shifted forward to not overlap d1 [0, 3]
  assert.ok(
    d2.inPoint >= d1.outPoint,
    `Reused asset inPoint (${d2.inPoint}) must be >= previous outPoint (${d1.outPoint})`
  );
});

// 10. Actual propagation of Director decisions into the timeline
test('AI Editorial Director: decisions cleanly propagate into TimelineComposition cuts', () => {
  const plan: EditorialPlan = {
    totalDurationSeconds: 5.5,
    decisions: [
      {
        shotId: 'shot_hook',
        sceneIndex: 0,
        shotIndex: 0,
        selectedCandidateId: 'candidate_galaxy_1',
        role: 'hook',
        narrationClause: 'Inside a magnetar core',
        durationSeconds: 2.5,
        videoSourcePath: '/tmp/fake_source_1.mp4',
        sourceDurationSeconds: 8.0,
        inPoint: 0.5,
        outPoint: 3.0,
        motionEffect: 'punch_in',
        motionIntensity: 'dramatic',
        cropMode: 'punch_in',
        transition: 'cut',
        captionTreatment: 'hook_pop',
        patternInterrupt: {
          type: 'punch_in',
          label: 'Core Focus',
          intensity: 'bold',
        },
        editorialReason: 'Opening punch-in hook',
        pacingWeight: 1.2,
      },
      {
        shotId: 'shot_fact',
        sceneIndex: 1,
        shotIndex: 0,
        selectedCandidateId: 'candidate_nebula_2',
        role: 'fact',
        narrationClause: 'magnetic fields shatter atoms',
        durationSeconds: 3.0,
        videoSourcePath: '/tmp/fake_source_2.mp4',
        sourceDurationSeconds: 10.0,
        inPoint: 1.0,
        outPoint: 4.0,
        motionEffect: 'pan_left',
        motionIntensity: 'moderate',
        cropMode: 'standard',
        transition: 'cut',
        captionTreatment: 'standard',
        editorialReason: 'Reveal magnetic disruption',
        pacingWeight: 1.0,
      },
    ],
    pacingBreakdown: {
      hookDuration: 2.5,
      averageShotDuration: 2.75,
      shotCount: 2,
      rapidShotsCount: 0,
      holdsCount: 1,
      staticHoldsCount: 0,
    },
    varietyScore: 80,
    patternInterruptCount: 1,
  };

  const timelineBuilder = new TimelineBuilder(logger);
  const timeline = timelineBuilder.buildTimelineFromEditorial(
    plan,
    '/tmp/narration.wav',
    []
  );

  assert.ok(timeline);
  assert.equal(timeline.cuts.length, 2);
  assert.equal(timeline.totalDurationSeconds, 5.5);

  const cut1 = timeline.cuts[0];
  assert.equal(cut1.shotId, 'shot_hook');
  assert.equal(cut1.videoSourcePath, '/tmp/fake_source_1.mp4');
  assert.equal(cut1.inPoint, 0.5);
  assert.equal(cut1.outPoint, 3.0);
  assert.equal(cut1.durationSeconds, 2.5);
  assert.equal(cut1.motionEffect, 'punch_in');
  assert.equal(cut1.cropMode, 'punch_in');
  assert.equal(cut1.captionTreatment, 'hook_pop');

  const cut2 = timeline.cuts[1];
  assert.equal(cut2.shotId, 'shot_fact');
  assert.equal(cut2.videoSourcePath, '/tmp/fake_source_2.mp4');
  assert.equal(cut2.motionEffect, 'pan_left');
  assert.equal(cut2.durationSeconds, 3.0);
});

// 11. Short-form vs Long-form editorial profiles
test('AI Editorial Director Profiles: validates short-form vs long-form threshold differences', () => {
  const validator = new AIDirectorValidator();
  const candidate = createMockCandidate({ durationSeconds: 20.0 });
  const board = createMockBoard([candidate]);

  // Short-form test: max shot duration is strictly capped (3.6s)
  const shortInput: AIDirectorInput = {
    format: 'short',
    targetDurationSeconds: 15.0,
    narrationText: 'Short test narration.',
    narrationDurationSeconds: 15.0,
    candidateBoard: board,
  };

  const shortPlan = validator.validateAndSanitize(
    {
      decisions: [
        { shotId: 's1', durationSeconds: 8.0 },
        { shotId: 's2', durationSeconds: 7.0 },
      ],
    },
    shortInput
  );

  assert.ok(shortPlan);
  assert.ok(
    shortPlan.decisions[0].durationSeconds <= 3.8,
    `Short-form shot duration was ${shortPlan.decisions[0].durationSeconds}, expected <= 3.8`
  );

  // Long-form test: allows long cinematic holds (up to 8.0s)
  const longInput: AIDirectorInput = {
    format: 'long',
    targetDurationSeconds: 16.0,
    narrationText: 'Long narrative explanation of black holes and cosmology.',
    narrationDurationSeconds: 16.0,
    candidateBoard: board,
  };

  const longPlan = validator.validateAndSanitize(
    {
      decisions: [
        { shotId: 'l1', durationSeconds: 8.0 },
        { shotId: 'l2', durationSeconds: 8.0 },
      ],
    },
    longInput
  );

  assert.ok(longPlan);
  assert.ok(
    longPlan.decisions[0].durationSeconds >= 5.0,
    `Long-form shot duration was ${longPlan.decisions[0].durationSeconds}, expected >= 5.0`
  );
});

// 12. VisualIntelligenceService: heuristic evaluations & contrast calculation
test('VisualIntelligenceService: computes composition, movement, lighting, and contrast', () => {
  const macroCandidate = createMockCandidate({
    id: 'c_microchip',
    provider: 'pexels',
    tags: ['microchip', 'circuit', 'macro', 'electronic', 'close-up'],
    semanticDescription: 'Macro extreme close-up of computer microprocessor circuits',
    thumbnailUrl: 'https://example.com/macro_thumb.jpg',
    width: 1080,
    height: 1920,
    relevanceScore: 95,
  });

  const wideCandidate = createMockCandidate({
    id: 'c_galaxy_wide',
    provider: 'pixabay',
    tags: ['space', 'galaxy', 'vista', 'stars', 'deep space', 'cosmic'],
    semanticDescription: 'Ultra-wide panoramic aerial vista of spiraling galaxy in dark cosmos',
    thumbnailUrl: 'https://example.com/galaxy_thumb.jpg',
    width: 1920,
    height: 1080,
    relevanceScore: 90,
  });

  const macroRef = VisualIntelligenceService.evaluateVisualReference(macroCandidate);
  assert.equal(macroRef.composition, 'macro');
  assert.ok(
    ['microchip', 'technology', 'circuit'].includes(macroRef.dominantSubject),
    `Dominant subject was ${macroRef.dominantSubject}`
  );
  assert.ok(macroRef.visualDescription.toLowerCase().includes('macro'));
  assert.ok(macroRef.aestheticScore >= 70);

  const wideRef = VisualIntelligenceService.evaluateVisualReference(wideCandidate);
  assert.ok(
    ['wide', 'aerial', 'extreme_wide'].includes(wideRef.composition),
    `Composition was ${wideRef.composition}`
  );
  assert.ok(
    ['space', 'galaxy', 'deep space'].includes(wideRef.dominantSubject),
    `Dominant subject was ${wideRef.dominantSubject}`
  );

  // Compute visual contrast between macro technology and wide space
  const contrast = VisualIntelligenceService.evaluateVisualContrast(macroCandidate, wideCandidate);
  assert.ok(
    contrast.overallContrastScore >= 50,
    `Expected high visual contrast, got score: ${contrast.overallContrastScore}`
  );
  assert.ok(contrast.compositionContrastScore >= 70, 'Expected composition contrast >= 70');
  assert.equal(contrast.hasSubjectRepetition, false, 'Expected no subject repetition');

  // Test scroll-stopping hook scoring for short form
  const hookPotential = VisualIntelligenceService.scoreScrollStopPotential(macroCandidate);
  assert.ok(hookPotential >= 60, `Expected strong scroll stop potential, got ${hookPotential}`);
});

// 13. Repetition Awareness: Validator detects and resolves consecutive identical asset reuse
test('AI Editorial Director Validator: detects and prevents consecutive identical asset repetition', () => {
  const validator = new AIDirectorValidator();
  const c1 = createMockCandidate({ id: 'candidate_alpha', durationSeconds: 10.0 });
  const c2 = createMockCandidate({ id: 'candidate_beta', durationSeconds: 10.0 });
  const board = createMockBoard([c1, c2]);

  const input: AIDirectorInput = {
    format: 'short',
    targetDurationSeconds: 6.0,
    narrationText: 'Testing anti-repetition guards.',
    narrationDurationSeconds: 6.0,
    candidateBoard: board,
  };

  // Raw decision payload proposes candidate_alpha twice consecutively
  const rawDecisions = {
    totalDurationSeconds: 6.0,
    decisions: [
      {
        shotId: 'shot_1',
        selectedCandidateId: 'candidate_alpha',
        inPoint: 0,
        outPoint: 3.0,
        durationSeconds: 3.0,
        role: 'hook',
      },
      {
        shotId: 'shot_2',
        selectedCandidateId: 'candidate_alpha', // Duplicate consecutive asset!
        inPoint: 3.0,
        outPoint: 6.0,
        durationSeconds: 3.0,
        role: 'fact',
      },
    ],
  };

  const plan = validator.validateAndSanitize(rawDecisions, input);
  assert.ok(plan);
  assert.equal(plan.decisions.length, 2);

  // Second shot must be remapped to candidate_beta to break consecutive duplicate
  assert.equal(plan.decisions[0].selectedCandidateId, 'candidate_alpha');
  assert.equal(plan.decisions[1].selectedCandidateId, 'candidate_beta');

  // Check validator issues logged the repetition fix
  const issues = validator.getIssues();
  const repetitionFix = issues.find((i) => i.issue.toLowerCase().includes('consecutive identical'));
  assert.ok(repetitionFix, 'Expected issue for consecutive identical asset resolution');
});

// 14. Dual-Format Long-form Chapters: builds structured chapters with pacing themes
test('Dual-Format Long-form Chapters: builds structured chapters with pacing themes', () => {
  const validator = new AIDirectorValidator();
  const candidates = [
    createMockCandidate({ id: 'c1', durationSeconds: 15.0 }),
    createMockCandidate({ id: 'c2', durationSeconds: 15.0 }),
    createMockCandidate({ id: 'c3', durationSeconds: 15.0 }),
    createMockCandidate({ id: 'c4', durationSeconds: 15.0 }),
  ];
  const board = createMockBoard(candidates);

  const longInput: AIDirectorInput = {
    format: 'long',
    targetDurationSeconds: 40.0,
    narrationText: 'A detailed 40-second long-form exploration of astrophysics across multiple scenes.',
    narrationDurationSeconds: 40.0,
    candidateBoard: board,
    scenePlan: {
      totalDurationSeconds: 40.0,
      scenes: [
        { index: 0, narration: 'Chapter 1 Hook', durationSeconds: 10.0, brollQuery: ['stars'], motionEffect: 'punch_in', captionText: 'Chapter 1 Hook' },
        { index: 1, narration: 'Chapter 2 Core Concept', durationSeconds: 10.0, brollQuery: ['nebula'], motionEffect: 'zoom_in', captionText: 'Chapter 2 Core Concept' },
        { index: 2, narration: 'Chapter 3 Deep Analysis', durationSeconds: 10.0, brollQuery: ['galaxy'], motionEffect: 'pan_left', captionText: 'Chapter 3 Deep Analysis' },
        { index: 3, narration: 'Chapter 4 Conclusion', durationSeconds: 10.0, brollQuery: ['space'], motionEffect: 'zoom_out', captionText: 'Chapter 4 Conclusion' },
      ],
    },
  };

  const rawDecisions = {
    totalDurationSeconds: 40.0,
    decisions: [
      { shotId: 's1', selectedCandidateId: 'c1', durationSeconds: 5.0, inPoint: 0, outPoint: 5.0 },
      { shotId: 's2', selectedCandidateId: 'c2', durationSeconds: 5.0, inPoint: 0, outPoint: 5.0 },
      { shotId: 's3', selectedCandidateId: 'c3', durationSeconds: 6.0, inPoint: 0, outPoint: 6.0 },
      { shotId: 's4', selectedCandidateId: 'c4', durationSeconds: 6.0, inPoint: 0, outPoint: 6.0 },
      { shotId: 's5', selectedCandidateId: 'c1', durationSeconds: 6.0, inPoint: 5.0, outPoint: 11.0 },
      { shotId: 's6', selectedCandidateId: 'c2', durationSeconds: 6.0, inPoint: 5.0, outPoint: 11.0 },
      { shotId: 's7', selectedCandidateId: 'c3', durationSeconds: 6.0, inPoint: 6.0, outPoint: 12.0 },
    ],
  };

  const plan = validator.validateAndSanitize(rawDecisions, longInput);
  assert.ok(plan);
  assert.equal(plan.format, 'long');
  assert.ok(plan.chapters && plan.chapters.length >= 2, 'Expected at least 2 long-form chapters');

  // Verify chapter structure
  const firstChapter = plan.chapters[0];
  assert.equal(firstChapter.chapterIndex, 1);
  assert.equal(firstChapter.startTime, 0);
  assert.ok(firstChapter.durationSeconds > 0);
  assert.ok(Boolean(firstChapter.visualTheme && firstChapter.visualTheme.length > 0));
  assert.equal(firstChapter.pacingStyle, 'hook and premise');
});

// 15. Director Prompt: embeds visual candidate intelligence and thumbnails
test('Director Prompt: embeds visual looks, composition, movement, and thumbnails', () => {
  const director = new AIDirectorService();
  const c1 = createMockCandidate({
    id: 'c_mars_orbit',
    tags: ['mars', 'planet', 'aerial', 'red', 'cinematic'],
    thumbnailUrl: 'https://images.pexels.com/mars_thumb.jpg',
    previewUrl: 'https://images.pexels.com/mars_prev.mp4',
    semanticDescription: 'Cinematic wide orbit over the Martian craters',
  });
  const board = createMockBoard([c1]);

  const input: AIDirectorInput = {
    format: 'short',
    targetDurationSeconds: 15.0,
    narrationText: 'Journey to the Red Planet.',
    narrationDurationSeconds: 15.0,
    candidateBoard: board,
  };

  const prompt = director.buildDirectorPrompt(
    input,
    CLIPFORGE_NICHE_PROFILE,
    SHORT_FORM_PROFILE
  );

  // Verify visual metadata is included in prompt
  assert.ok(prompt.includes('visualLook'), 'Prompt must include visualLook');
  assert.ok(prompt.includes('composition'), 'Prompt must include composition');
  assert.ok(prompt.includes('movement'), 'Prompt must include movement');
  assert.ok(prompt.includes('thumbnailUrl'), 'Prompt must include thumbnailUrl');
  assert.ok(prompt.includes('https://images.pexels.com/mars_thumb.jpg'), 'Prompt must include specific thumbnail');
  assert.ok(prompt.includes('SHORT-FORM'), 'Prompt must include format-specific section');
  assert.ok(prompt.includes('ANTI-REPETITION'), 'Prompt must include anti-repetition rules');
});

