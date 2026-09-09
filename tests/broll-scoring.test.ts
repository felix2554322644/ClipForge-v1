import test from 'node:test';
import assert from 'node:assert/strict';
import { BrollScorer } from '../src/services/broll/scorer';

test('B-Roll Scoring: Scores native 1080x1920 portrait footage highly', () => {
  const score = BrollScorer.scoreCandidate(
    { width: 1080, height: 1920, duration: 8 },
    5
  );
  assert.ok(score >= 85, `Expected score >= 85, got ${score}`);
});

test('B-Roll Scoring: Penalizes clips shorter than requested duration', () => {
  const shortClipScore = BrollScorer.scoreCandidate(
    { width: 1080, height: 1920, duration: 2 },
    6
  );
  const goodClipScore = BrollScorer.scoreCandidate(
    { width: 1080, height: 1920, duration: 8 },
    6
  );
  assert.ok(
    goodClipScore > shortClipScore,
    `Good clip score (${goodClipScore}) should exceed short clip score (${shortClipScore})`
  );
});

test('B-Roll Scoring: Handles landscape 1920x1080 footage with reframing allowance', () => {
  const score = BrollScorer.scoreCandidate(
    { width: 1920, height: 1080, duration: 10 },
    5
  );
  assert.ok(score >= 60, `Expected landscape score >= 60, got ${score}`);
});
