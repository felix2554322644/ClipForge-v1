import test from 'node:test';
import assert from 'node:assert/strict';
import { ScenePlanner } from '../src/services/scenes/planner';
import { BrollScorer } from '../src/services/broll/scorer';
import { PipelineLogger } from '../src/services/logging/logger';
import { ScriptOutput } from '../src/types/pipeline';

test('Beat Planning: Generates multiple visual shots for a complex narration beat', () => {
  const logger = new PipelineLogger();
  const planner = new ScenePlanner(logger);

  const script: ScriptOutput = {
    title: 'Magnetar Revelation',
    totalEstimatedSeconds: 30,
    scenes: [
      {
        index: 0,
        narration: 'Deep space telescopes detected a blast, but scientists had no idea what caused it.',
        visualDescription: 'Observatory and cosmic signal',
        suggestedKeywords: ['telescope', 'deep space'],
      },
      {
        index: 1,
        narration: 'Scientists recently traced one of these signals to a magnetar, a dead star with a magnetic field trillions of times stronger than Earth.',
        visualDescription: 'Magnetar magnetic field',
        suggestedKeywords: ['magnetar', 'neutron star', 'magnetic field'],
      },
      {
        index: 2,
        narration: 'In a single millisecond, it unleashed more energy than our Sun produces in a century.',
        visualDescription: 'Cosmic explosion',
        suggestedKeywords: ['energy burst', 'supernova'],
      },
    ],
  };

  const totalAudioDuration = 28.5;
  const plan = planner.planScenes(script, totalAudioDuration);

  // Total shots should be significantly higher than 3 (expecting ~6-12 shots)
  assert.ok(plan.totalShots && plan.totalShots >= 6, `Expected >= 6 shots, got ${plan.totalShots}`);
  assert.ok(plan.shots && plan.shots.length >= 6);

  // Scene 1 should contain multiple shots
  assert.ok(plan.scenes[1].shots && plan.scenes[1].shots.length >= 2, 'Scene 1 should have multiple shots');

  // Verify duration normalization: sum of all shots matches totalAudioDuration
  const sumShotDurations = plan.shots.reduce((sum, s) => sum + s.durationSeconds, 0);
  const diff = Math.abs(sumShotDurations - totalAudioDuration);
  assert.ok(diff < 0.1, `Shot durations sum (${sumShotDurations}s) should match total duration (${totalAudioDuration}s)`);

  // Verify shot pacing bounds
  for (const shot of plan.shots) {
    assert.ok(shot.durationSeconds >= 0.75, `Shot ${shot.id} duration (${shot.durationSeconds}s) too short`);
    assert.ok(shot.durationSeconds <= 6.0, `Shot ${shot.id} duration (${shot.durationSeconds}s) too long`);
    assert.ok(shot.brollQueries.length >= 1, `Shot ${shot.id} should have targeted queries`);
  }
});

test('B-Roll Variety: Penalizes already-used clip IDs to ensure visual variety', () => {
  const candidate = {
    id: 'clip_abc_123',
    width: 1080,
    height: 1920,
    duration: 10,
    url: 'https://example.com/clip.mp4',
  };

  const freshEvaluation = BrollScorer.evaluateCandidate(candidate, 3.0, 9 / 16, []);
  const reusedEvaluation = BrollScorer.evaluateCandidate(candidate, 3.0, 9 / 16, ['clip_abc_123']);

  assert.ok(
    freshEvaluation.score > reusedEvaluation.score,
    `Fresh clip score (${freshEvaluation.score}) should exceed reused clip score (${reusedEvaluation.score})`
  );

  assert.equal(freshEvaluation.breakdown.uniqueness, 10);
  assert.equal(reusedEvaluation.breakdown.uniqueness, -35);
  assert.ok(reusedEvaluation.reason.includes('Penalized'));
});
