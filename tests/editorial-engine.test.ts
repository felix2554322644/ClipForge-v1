import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorialEngine } from '../src/services/editorial/editorialEngine';
import {
  CaptionSegment,
  PlannedShot,
  ScenePlanOutput,
  ScriptOutput,
  SelectedBrollScene,
} from '../src/types/pipeline';

function createMockScript(): ScriptOutput {
  return {
    hook: 'Deep inside the cosmos, a blast of energy just released more power than five hundred million suns.',
    coreMystery: 'Astronomers detected a fast radio burst that repeats in a mathematical rhythm.',
    payoff: 'We now know it originates from a magnetar with magnetic fields trillions of times stronger than Earth.',
    closingCall: 'Subscribe to uncover the next cosmic mystery.',
    estimatedDurationSeconds: 28,
    scenes: [
      {
        index: 0,
        type: 'hook',
        narration: 'Deep inside the cosmos, a blast of energy just released more power than 500 million suns.',
        brollKeyword: 'cosmic explosion deep space',
        durationSeconds: 3.5,
      },
      {
        index: 1,
        type: 'setup',
        narration: 'Why is this signal repeating every 16 days like clockwork?',
        brollKeyword: 'radio telescope antenna dish',
        durationSeconds: 3.8,
      },
      {
        index: 2,
        type: 'escalation',
        narration: 'Over 10,000 light years away, extreme forces are bending the laws of physics.',
        brollKeyword: 'pulsar neutron star spinning',
        durationSeconds: 4.2,
      },
      {
        index: 3,
        type: 'reveal',
        narration: 'Turns out, the secret is a magnetar with magnetic fields trillions of times stronger than Earth.',
        brollKeyword: 'magnetic field space plasma',
        durationSeconds: 4.5,
      },
      {
        index: 4,
        type: 'payoff',
        narration: 'It unleashes cataclysmic starquakes that shatter surrounding space.',
        brollKeyword: 'galaxy shockwave explosion',
        durationSeconds: 4.0,
      },
      {
        index: 5,
        type: 'call_to_action',
        narration: 'What cosmic mystery should we decode next?',
        brollKeyword: 'starfield milky way night sky',
        durationSeconds: 3.2,
      },
    ],
  };
}

function createMockScenePlan(): ScenePlanOutput {
  const shots: PlannedShot[] = [
    {
      id: 'scene_0_shot_0',
      sceneIndex: 0,
      shotIndex: 0,
      narrationClause: 'Deep inside the cosmos, a blast of energy just released',
      visualDescription: 'Deep space explosion',
      searchQuery: 'cosmic explosion',
      brollQueries: ['cosmic explosion'],
      durationSeconds: 3.5,
      motionEffect: 'zoom_in',
      transition: 'cut',
    },
    {
      id: 'scene_1_shot_0',
      sceneIndex: 1,
      shotIndex: 0,
      narrationClause: 'Why is this signal repeating every 16 days like clockwork?',
      visualDescription: 'Radio telescope array',
      searchQuery: 'radio telescope',
      brollQueries: ['radio telescope'],
      durationSeconds: 3.8,
      motionEffect: 'pan_left',
      transition: 'cut',
    },
    {
      id: 'scene_2_shot_0',
      sceneIndex: 2,
      shotIndex: 0,
      narrationClause: 'Over 10,000 light years away, extreme forces are bending physics.',
      visualDescription: 'Spinning neutron star',
      searchQuery: 'neutron star',
      brollQueries: ['neutron star'],
      durationSeconds: 4.2,
      motionEffect: 'zoom_in',
      transition: 'cut',
    },
    {
      id: 'scene_3_shot_0',
      sceneIndex: 3,
      shotIndex: 0,
      narrationClause: 'Turns out, the secret is a magnetar with fields trillions of times stronger.',
      visualDescription: 'Magnetic plasma nebula',
      searchQuery: 'space plasma',
      brollQueries: ['space plasma'],
      durationSeconds: 4.5,
      motionEffect: 'static',
      transition: 'cut',
    },
    {
      id: 'scene_4_shot_0',
      sceneIndex: 4,
      shotIndex: 0,
      narrationClause: 'It unleashes cataclysmic starquakes that shatter surrounding space.',
      visualDescription: 'Space shockwave',
      searchQuery: 'space shockwave',
      brollQueries: ['space shockwave'],
      durationSeconds: 4.0,
      motionEffect: 'pan_right',
      transition: 'cut',
    },
    {
      id: 'scene_5_shot_0',
      sceneIndex: 5,
      shotIndex: 0,
      narrationClause: 'What cosmic mystery should we decode next?',
      visualDescription: 'Deep galaxy field',
      searchQuery: 'milky way',
      brollQueries: ['milky way'],
      durationSeconds: 3.2,
      motionEffect: 'static',
      transition: 'cut',
    },
  ];

  return {
    totalDurationSeconds: 23.2,
    scenes: [],
    shots,
  };
}

function createMockBroll(shots: PlannedShot[]): SelectedBrollScene[] {
  return shots.map((s, idx) => ({
    sceneIndex: s.sceneIndex,
    shotIndex: s.shotIndex,
    shotId: s.id,
    queryUsed: s.searchQuery || 'space',
    sourceDimensions: { width: 1080, height: 1920 },
    sourceAspectRatio: 0.5625,
    cropRequired: false,
    cropAmount: 0,
    nativeVertical: true,
    provider: 'pexels',
    providerAssetId: `asset_${idx % 3}`, // intentional reuse to test interval tracking!
    reframedPath: `/tmp/cache/video_${idx % 3}.mp4`,
    inPoint: 0,
    outPoint: s.durationSeconds,
    broll: {
      id: `asset_${idx % 3}`,
      url: 'https://example.com/video.mp4',
      provider: 'pexels',
      source: 'pexels',
      title: 'Cosmic footage',
      videoPath: `/tmp/cache/video_${idx % 3}.mp4`,
      durationSeconds: 12.0,
      originalWidth: 1080,
      originalHeight: 1920,
      aspectRatio: 0.5625,
      cropRequired: false,
      cropAmount: 0,
      nativeVertical: true,
      relevanceScore: 0.95,
    },
  }));
}

test('EditorialEngine: Classifies narration roles accurately based on linguistic beats', () => {
  const engine = new EditorialEngine();

  assert.equal(engine.classifyShotRole('You will not believe this discovery.', 0, 6), 'hook');
  assert.equal(engine.classifyShotRole('Why does this star blink every 16 seconds?', 1, 6), 'question');
  assert.equal(engine.classifyShotRole('It outputs over 500 million megawatts of energy.', 2, 6), 'statistic');
  assert.equal(engine.classifyShotRole('Turns out, the secret is a supermassive magnetar.', 3, 6), 'reveal');
  assert.equal(engine.classifyShotRole('Extreme forces explode across the event horizon.', 4, 6), 'payoff');
  assert.equal(engine.classifyShotRole('Follow for more space mysteries.', 5, 6), 'conclusion');
});

test('EditorialEngine: Pacing calculation produces varied, dynamic shot lengths and exact sum', () => {
  const engine = new EditorialEngine();
  const script = createMockScript();
  const scenePlan = createMockScenePlan();
  const totalDuration = 20.0;

  const rawShots = scenePlan.shots!.map((s) => ({ id: s.id, narrationClause: s.narrationClause }));
  const roles = rawShots.map((s, idx) => engine.classifyShotRole(s.narrationClause, idx, rawShots.length));

  const durations = engine.calculatePacingDurations(rawShots, roles, totalDuration);

  // Exact sum preservation
  const sum = Math.round(durations.reduce((a, b) => a + b, 0) * 100) / 100;
  assert.equal(sum, totalDuration);

  // Not all equal lengths
  const uniqueDurations = new Set(durations);
  assert.ok(uniqueDurations.size >= 3, 'Shot durations must vary dynamically');

  // Verify boundaries: all shots within [0.9s, 4.2s]
  for (const d of durations) {
    assert.ok(d >= 0.9, `Duration ${d} must be >= 0.9s`);
    assert.ok(d <= 4.2, `Duration ${d} must be <= 4.2s`);
  }

  // Hook must be punchy (< 3.8s)
  assert.ok(durations[0] <= 3.8, 'Opening hook must be fast and punchy');
});

test('EditorialEngine: Source clip range selection picks inPoint > 0 and prevents duplicate frame overlap', () => {
  const engine = new EditorialEngine();
  const usedIntervals = new Map<string, { start: number; end: number }[]>();
  const clipKey = 'space_nebula_01';
  const sourceDuration = 15.0;

  // Shot 1 on this clip
  const shot1Range = engine.calculateSourceRange(clipKey, sourceDuration, 3.0, usedIntervals, false);
  assert.ok(shot1Range.inPoint >= 0.8, 'First use should skip initial camera start');
  assert.equal(shot1Range.outPoint, Math.round((shot1Range.inPoint + 3.0) * 100) / 100);

  // Shot 2 reusing the SAME clip: must advance to fresh section!
  const shot2Range = engine.calculateSourceRange(clipKey, sourceDuration, 2.5, usedIntervals, false);
  assert.ok(
    shot2Range.inPoint >= shot1Range.outPoint,
    `Reused clip inPoint (${shot2Range.inPoint}) must not overlap prior outPoint (${shot1Range.outPoint})`
  );
  assert.ok(
    shot2Range.outPoint <= sourceDuration,
    `Reused clip outPoint (${shot2Range.outPoint}) must not exceed sourceDuration (${sourceDuration})`
  );
});

test('EditorialEngine: Motion selection enforces variety and prevents consecutive duplicate motions', () => {
  const engine = new EditorialEngine();
  const script = createMockScript();
  const scenePlan = createMockScenePlan();
  const broll = createMockBroll(scenePlan.shots!);

  const plan = engine.makeEditorialDecisions({
    scenePlan,
    brollSelections: broll,
    script,
    totalDurationSeconds: 24.0,
  });

  assert.equal(plan.decisions.length, scenePlan.shots!.length);

  // Check that consecutive shots NEVER have identical motion
  for (let i = 1; i < plan.decisions.length; i++) {
    const prev = plan.decisions[i - 1].motionEffect;
    const curr = plan.decisions[i].motionEffect;
    assert.notEqual(
      curr,
      prev,
      `Consecutive shots ${i - 1} and ${i} must not repeat motion '${curr}'`
    );
  }

  // Check that breathing room (static holds) exists
  const staticShots = plan.decisions.filter((d) => d.motionEffect === 'static');
  assert.ok(
    staticShots.length >= 1,
    'Editorial plan must include static holds for visual breathing room'
  );

  // Variety score must be healthy
  assert.ok(plan.varietyScore >= 50, `Variety score (${plan.varietyScore}) should be >= 50`);
});

test('EditorialEngine: Pattern interrupts are placed purposefully at high-impact moments', () => {
  const engine = new EditorialEngine();
  const script = createMockScript();
  const scenePlan = createMockScenePlan();
  const broll = createMockBroll(scenePlan.shots!);

  const plan = engine.makeEditorialDecisions({
    scenePlan,
    brollSelections: broll,
    script,
    totalDurationSeconds: 24.0,
  });

  // Hook must have immediacy pop / punch_in
  assert.ok(plan.decisions[0].patternInterrupt, 'Opening hook should receive an editorial pattern interrupt');
  assert.equal(plan.decisions[0].patternInterrupt?.type, 'punch_in');

  // Interrupt count should be disciplined (not on every shot)
  assert.ok(
    plan.patternInterruptCount >= 1 && plan.patternInterruptCount <= 3,
    `Pattern interrupt count (${plan.patternInterruptCount}) must be controlled (1 to 3)`
  );
});
