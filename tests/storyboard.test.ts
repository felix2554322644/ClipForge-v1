import test from 'node:test';
import assert from 'node:assert';
import {
  StoryboardValidator,
  DeterministicStoryboardEngine,
  AIStoryboardService,
} from '../src/services/storyboard/index';
import { StoryboardInput, StoryboardShot } from '../src/types/storyboard';
import { ScriptOutput } from '../src/types/pipeline';
import { BrollSearcher } from '../src/services/broll/searcher';
import { AIDirectorService } from '../src/services/editorial/director';
import { CLIPFORGE_NICHE_PROFILE } from '../src/services/editorial/profiles';
import { GeminiClient } from '../src/services/gemini/client';

const mockScript: ScriptOutput = {
  title: 'Why Neutron Stars Defy Physics',
  hook: 'A single teaspoon of this star weighs as much as Mount Everest.',
  scenes: [
    {
      index: 0,
      narration: 'A single teaspoon of this star weighs as much as Mount Everest.',
      durationSeconds: 3.5,
      suggestedKeywords: ['neutron star', 'mount everest scale', 'astrophysics'],
    },
    {
      index: 1,
      narration: 'A dead star spinning hundreds of times per second, packing the mass of our sun into a city-sized sphere.',
      durationSeconds: 4.5,
      suggestedKeywords: ['pulsar spinning', 'city scale sphere', 'magnetic field plasma'],
    },
    {
      index: 2,
      narration: 'Look closer. Listen carefully. Its magnetic field can rip atoms apart from thousands of miles away.',
      durationSeconds: 4.0,
      suggestedKeywords: ['magnetar flare', 'radio telescope dish', 'atomic distortion'],
    },
  ],
  estimatedDurationSeconds: 12.0,
};

test('Storyboard Validator: Normalizes duration, timing bounds, and timestamps strictly', () => {
  const validator = new StoryboardValidator();
  const input: StoryboardInput = {
    script: mockScript,
    narrationText: mockScript.scenes.map((s) => s.narration).join(' '),
    narrationDurationSeconds: 12.45,
    format: 'short',
  };

  const rawGeminiResponse = {
    title: 'Why Neutron Stars Defy Physics',
    visualThemes: ['neutron star', 'astrophysics'],
    shots: [
      {
        shotId: 'shot_0',
        sceneIndex: 0,
        shotIndex: 0,
        narrationStart: 0.0,
        narrationEnd: 3.0,
        narrationClause: 'A single teaspoon of this star weighs as much as Mount Everest.',
        visualSubject: 'Glowing superdense neutron star core',
        action: 'Emitting high-intensity relativistic beams',
        environment: 'Dark cosmic void',
        emotion: 'shock and wonder',
        framing: 'wide establishing',
        cameraMovement: 'slow push in',
        visualPurpose: 'hook_grab',
        visualPriority: 'critical',
        preferredVisualType: 'stock',
        searchQueries: ['neutron star space 4k video', 'pulsar celestial beam cinematic'],
      },
      {
        shotId: 'shot_1',
        sceneIndex: 1,
        shotIndex: 0,
        narrationStart: 3.0,
        narrationEnd: 8.0,
        narrationClause: 'A dead star spinning hundreds of times per second',
        visualSubject: 'Rapidly rotating magnetar with warped magnetic fields',
        action: 'Spinning violently and twisting spacetime',
        environment: 'Stellar nebula remnant',
        emotion: 'tension',
        framing: 'macro close-up',
        cameraMovement: 'kinetic orbital rotation',
        visualPurpose: 'scale_contrast',
        visualPriority: 'high',
        preferredVisualType: 'stock',
        searchQueries: ['spinning star plasma', 'pulsar magnetic field'],
      },
      {
        shotId: 'shot_2',
        sceneIndex: 2,
        shotIndex: 0,
        narrationStart: 8.0,
        narrationEnd: 15.0, // Exceeds 12.45s!
        narrationClause: 'Its magnetic field can rip atoms apart from thousands of miles away.',
        visualSubject: 'Massive radio telescope observatory',
        action: 'Dishes tracking pulsar signal',
        environment: 'Desert mountain under starry night sky',
        emotion: 'revelation',
        framing: 'low-angle dramatic',
        cameraMovement: 'slow upward tilt',
        visualPurpose: 'closing_call',
        visualPriority: 'critical',
        preferredVisualType: 'stock',
        searchQueries: ['radio telescope starry night', 'astronomical observatory'],
      },
    ],
  };

  const validated = validator.validateAndSanitize(rawGeminiResponse, input);
  assert.ok(validated, 'Validated storyboard must not be null');
  assert.strictEqual(validated.totalShots, 3);
  assert.strictEqual(validated.totalDurationSeconds, 12.45);

  // Timestamps must start at 0.00 and end exactly at 12.45
  assert.strictEqual(validated.shots[0].narrationStart, 0);
  assert.strictEqual(validated.shots[validated.shots.length - 1].narrationEnd, 12.45);

  // Monotonic timestamp continuity
  for (let i = 0; i < validated.shots.length - 1; i++) {
    assert.strictEqual(
      validated.shots[i].narrationEnd,
      validated.shots[i + 1].narrationStart,
      `Shot ${i} end must match Shot ${i + 1} start`
    );
  }

  // Sum of durationSeconds must equal 12.45 within precision
  const sumDuration = validated.shots.reduce((acc, s) => acc + s.durationSeconds, 0);
  assert.ok(
    Math.abs(sumDuration - 12.45) < 0.01,
    `Duration sum (${sumDuration}) must equal target duration 12.45`
  );

  // Search queries must have stripped generic words ("4k", "video", "cinematic")
  const shot0Queries = validated.shots[0].searchQueries;
  for (const q of shot0Queries) {
    assert.ok(!q.includes('4k'), 'Queries must not contain generic noise "4k"');
    assert.ok(!q.includes('cinematic'), 'Queries must not contain generic noise "cinematic"');
  }
});

test('Storyboard Validator: Rejects unrecoverable input and handles field sanitization', () => {
  const validator = new StoryboardValidator();
  const input: StoryboardInput = {
    script: mockScript,
    narrationText: 'Sample text',
    narrationDurationSeconds: 10.0,
  };

  assert.strictEqual(validator.validateAndSanitize(null, input), null);
  assert.strictEqual(validator.validateAndSanitize({}, input), null);
  assert.strictEqual(validator.validateAndSanitize({ shots: [] }, input), null);

  // Field sanitization for invalid visual types and priorities
  const invalidFieldsRaw = {
    shots: [
      {
        shotId: '',
        narrationStart: 0,
        narrationEnd: 10,
        visualPriority: 'SUPER_URGENT_INVALID',
        preferredVisualType: 'INVALID_TYPE',
        searchQueries: [],
      },
    ],
  };

  const result = validator.validateAndSanitize(invalidFieldsRaw, input);
  assert.ok(result);
  assert.strictEqual(result.shots[0].visualPriority, 'high'); // Sanitized default
  assert.strictEqual(result.shots[0].preferredVisualType, 'stock'); // Sanitized default
  assert.ok(result.shots[0].searchQueries.length >= 2, 'Must synthesize queries when empty');
});

test('Deterministic Storyboard Engine: Generates all 12 metadata fields per shot', () => {
  const engine = new DeterministicStoryboardEngine();
  const input: StoryboardInput = {
    script: mockScript,
    narrationText: mockScript.scenes.map((s) => s.narration).join(' '),
    narrationDurationSeconds: 14.8,
    format: 'short',
  };

  const storyboard = engine.generateStoryboard(input);
  assert.ok(storyboard);
  assert.strictEqual(storyboard.totalDurationSeconds, 14.8);
  assert.strictEqual(storyboard.format, 'short');
  assert.ok(storyboard.shots.length >= 3, 'Must have at least 3 visual shots');

  for (let i = 0; i < storyboard.shots.length; i++) {
    const s: StoryboardShot = storyboard.shots[i];
    // 12 Required Fields verification
    assert.ok(s.shotId, `Shot ${i} must have shotId`);
    assert.strictEqual(typeof s.narrationStart, 'number', `Shot ${i} must have narrationStart`);
    assert.strictEqual(typeof s.narrationEnd, 'number', `Shot ${i} must have narrationEnd`);
    assert.ok(s.visualSubject, `Shot ${i} must have visualSubject`);
    assert.ok(s.action, `Shot ${i} must have action`);
    assert.ok(s.environment, `Shot ${i} must have environment`);
    assert.ok(s.emotion, `Shot ${i} must have emotion`);
    assert.ok(s.framing, `Shot ${i} must have framing`);
    assert.ok(s.cameraMovement, `Shot ${i} must have cameraMovement`);
    assert.ok(s.visualPurpose, `Shot ${i} must have visualPurpose`);
    assert.ok(
      ['critical', 'high', 'medium', 'supporting'].includes(s.visualPriority),
      `Shot ${i} must have valid visualPriority`
    );
    assert.ok(
      ['stock', 'custom', 'graphic', 'typography'].includes(s.preferredVisualType),
      `Shot ${i} must have valid preferredVisualType`
    );
    assert.ok(
      Array.isArray(s.searchQueries) && s.searchQueries.length >= 2,
      `Shot ${i} must have at least 2 search queries`
    );
  }
});

test('Deterministic Storyboard Engine: Story-driven visual beats (multi-shot clauses and multi-clause shots)', () => {
  const engine = new DeterministicStoryboardEngine();
  const dramaticScript: ScriptOutput = {
    title: 'Magnetar Physics',
    hook: 'A dead star spinning hundreds of times per second, packing the mass of our sun into a city-sized sphere.',
    scenes: [
      {
        index: 0,
        // Long dramatic contrast clause: should expand to multi-shot (Shot 1: macro spin, Shot 2: city scale core)
        narration: 'A dead star spinning hundreds of times per second, packing the mass of our sun into a city-sized sphere.',
        durationSeconds: 6.0,
      },
      {
        index: 1,
        // Consecutive short clauses: should combine into a single multi-clause shot
        narration: 'Look closer. Listen carefully.',
        durationSeconds: 2.5,
      },
    ],
    estimatedDurationSeconds: 8.5,
  };

  const storyboard = engine.generateStoryboard({
    script: dramaticScript,
    narrationText: 'A dead star spinning hundreds of times per second, packing the mass of our sun into a city-sized sphere. Look closer. Listen carefully.',
    narrationDurationSeconds: 8.5,
    format: 'short',
  });

  // Scene 0 should have produced 2 shots (multi-shot clause expansion)
  const scene0Shots = storyboard.shots.filter((s) => s.sceneIndex === 0);
  assert.strictEqual(
    scene0Shots.length,
    2,
    'Dramatic contrast clause in Scene 0 must expand into 2 distinct visual shots'
  );
  assert.strictEqual(scene0Shots[0].framing, 'wide establishing');
  assert.strictEqual(scene0Shots[1].framing, 'extreme close-up detail');

  // Scene 1 with short connective sentences ("Look closer. Listen carefully.") should be 1 consolidated shot
  const scene1Shots = storyboard.shots.filter((s) => s.sceneIndex === 1);
  assert.strictEqual(
    scene1Shots.length,
    1,
    'Short connective sentences must be consolidated into 1 visual shot'
  );
  assert.ok(
    scene1Shots[0].narrationClause.includes('Look closer') &&
      scene1Shots[0].narrationClause.includes('Listen carefully'),
    'Consolidated shot must encompass both short clauses'
  );
});

test('Broll Searcher: Consumes Storyboard and populates Candidate Board with semantic visual look', async () => {
  const engine = new DeterministicStoryboardEngine();
  const storyboard = engine.generateStoryboard({
    script: mockScript,
    narrationText: mockScript.scenes.map((s) => s.narration).join(' '),
    narrationDurationSeconds: 12.0,
    format: 'short',
  });

  const searcher = new BrollSearcher();
  const candidateBoard = await searcher.buildCandidateBoard(storyboard);

  assert.ok(candidateBoard, 'Candidate board must be created');
  assert.ok(candidateBoard.totalCandidates > 0, 'Candidate board must have candidates');
  assert.ok(candidateBoard.queriesRun.length > 0, 'Queries must have been recorded');

  // Check candidate metadata links back to storyboard shot IDs and visual intelligence
  for (const candidate of candidateBoard.candidates) {
    assert.ok(candidate.id, 'Candidate must have an id');
    assert.ok(candidate.targetShotId, 'Candidate must link to a targetShotId');
    assert.ok(candidate.visualReference, 'Candidate must have evaluated visual reference');
    assert.ok(
      candidate.visualReference.visualDescription.length > 0,
      'Visual reference must contain semantic description'
    );
  }
});

test('AI Editorial Director: Successfully directs video using Storyboard input', async () => {
  const engine = new DeterministicStoryboardEngine();
  const storyboard = engine.generateStoryboard({
    script: mockScript,
    narrationText: mockScript.scenes.map((s) => s.narration).join(' '),
    narrationDurationSeconds: 12.0,
    format: 'short',
  });

  const searcher = new BrollSearcher();
  const candidateBoard = await searcher.buildCandidateBoard(storyboard);

  const mockGemini = {
    isAvailable: () => false,
    generateJson: async () => {
      throw new Error('Fallback');
    },
  } as unknown as GeminiClient;

  const director = new AIDirectorService({
    geminiClient: mockGemini,
  });

  const editorialPlan = await director.directVideo({
    nicheProfile: CLIPFORGE_NICHE_PROFILE,
    format: 'short',
    targetDurationSeconds: 12.0,
    script: mockScript,
    narrationText: mockScript.scenes.map((s) => s.narration).join(' '),
    narrationDurationSeconds: 12.0,
    storyboard,
    candidateBoard,
  });

  assert.ok(editorialPlan, 'Editorial plan must be created');
  assert.strictEqual(editorialPlan.totalDurationSeconds, 12.0);
  assert.ok(editorialPlan.decisions.length > 0, 'Must have editorial decisions');

  // Verify decisions align with storyboard shots
  assert.strictEqual(editorialPlan.decisions.length, storyboard.shots.length);
  for (let i = 0; i < editorialPlan.decisions.length; i++) {
    const dec = editorialPlan.decisions[i];
    const shot = storyboard.shots[i];
    assert.strictEqual(dec.shotId, shot.shotId);
    assert.strictEqual(dec.durationSeconds, shot.durationSeconds);
  }
});

test('AI Storyboard Service: Handles Gemini failure gracefully and executes fallback', async () => {
  // Mock GeminiClient that always throws an error
  const failingGemini = {
    isAvailable: () => true,
    generateJson: async () => {
      throw new Error('Gemini quota exhausted (HTTP 429)');
    },
  } as unknown as GeminiClient;

  const service = new AIStoryboardService({
    geminiClient: failingGemini,
  });

  const storyboard = await service.generateStoryboard({
    script: mockScript,
    narrationText: mockScript.scenes.map((s) => s.narration).join(' '),
    narrationDurationSeconds: 10.5,
    format: 'short',
  });

  assert.ok(storyboard, 'Must return fallback storyboard');
  assert.strictEqual(storyboard.generatedBy, 'deterministic_fallback');
  assert.strictEqual(storyboard.totalDurationSeconds, 10.5);
  assert.ok(storyboard.shots.length > 0);
});

test('AI Storyboard Service: Short vs Long format profile scaling', async () => {
  const engine = new DeterministicStoryboardEngine();

  const shortStoryboard = engine.generateStoryboard({
    script: mockScript,
    narrationText: mockScript.scenes.map((s) => s.narration).join(' '),
    narrationDurationSeconds: 12.0,
    format: 'short',
  });

  const longStoryboard = engine.generateStoryboard({
    script: mockScript,
    narrationText: mockScript.scenes.map((s) => s.narration).join(' '),
    narrationDurationSeconds: 60.0,
    format: 'long',
  });

  assert.strictEqual(shortStoryboard.format, 'short');
  assert.strictEqual(longStoryboard.format, 'long');

  // Verify shot duration boundaries
  for (const s of shortStoryboard.shots) {
    assert.ok(s.durationSeconds <= 4.5, `Short shot duration (${s.durationSeconds}) must be <= 4.5s`);
  }

  for (const s of longStoryboard.shots) {
    assert.ok(s.durationSeconds <= 8.0, `Long shot duration (${s.durationSeconds}) must be <= 8.0s`);
  }
});
