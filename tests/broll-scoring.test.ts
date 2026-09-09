import test from 'node:test';
import assert from 'node:assert/strict';
import { BrollScorer } from '../src/services/broll/scorer';

test('B-Roll Scoring: Scores native 1080x1920 portrait footage highly', () => {
  const evalResult = BrollScorer.evaluateCandidate(
    { width: 1080, height: 1920, duration: 8 },
    5,
    9 / 16,
    [],
    'galaxy stars'
  );
  assert.equal(evalResult.isRejected, false);
  assert.ok(evalResult.score >= 85, `Expected score >= 85, got ${evalResult.score}`);
  assert.equal(evalResult.breakdown.portrait, 30, 'Native 9:16 portrait should receive 30 pts');
});

test('B-Roll Scoring: Rejects landscape footage by default with hard filter', () => {
  const evalResult = BrollScorer.evaluateCandidate(
    { width: 1920, height: 1080, duration: 10 },
    5,
    9 / 16,
    [],
    'galaxy stars',
    false // allowLandscape = false
  );
  assert.equal(evalResult.isRejected, true, 'Landscape footage must be rejected by default');
  assert.equal(evalResult.score, 0, 'Rejected landscape candidate must receive score 0');
  assert.ok(evalResult.rejectReason?.includes('Landscape footage rejected'));
});

test('B-Roll Scoring: Native 9:16 beats 4:5 portrait and square', () => {
  const native916 = BrollScorer.evaluateCandidate(
    { width: 1080, height: 1920, duration: 8 },
    5
  );
  const portrait45 = BrollScorer.evaluateCandidate(
    { width: 1080, height: 1350, duration: 8 }, // 4:5 ratio = 0.8
    5
  );
  const square = BrollScorer.evaluateCandidate(
    { width: 1080, height: 1080, duration: 8 }, // 1:1 ratio = 1.0
    5
  );

  assert.ok(
    native916.score > portrait45.score,
    `Native 9:16 (${native916.score}) must score higher than 4:5 (${portrait45.score})`
  );
  assert.ok(
    portrait45.score > square.score,
    `4:5 portrait (${portrait45.score}) must score higher than square (${square.score})`
  );
  assert.equal(native916.breakdown.portrait, 30);
  assert.equal(portrait45.breakdown.portrait, 14);
  assert.equal(square.breakdown.portrait, 4);
});

test('B-Roll Scoring: Native portrait beats landscape even when landscape has higher semantic score', () => {
  // Candidate 1: Native 9:16 with moderate semantic match
  const portraitCandidate = BrollScorer.evaluateCandidate(
    { width: 1080, height: 1920, duration: 6, url: 'https://pexels.com/v/stars-nebula' },
    4,
    9 / 16,
    [],
    'magnetar cosmic burst'
  );

  // Candidate 2: Landscape with fallback allowed and strong keyword match
  const landscapeCandidate = BrollScorer.evaluateCandidate(
    { width: 1920, height: 1080, duration: 6, url: 'https://pexels.com/v/magnetar-cosmic-burst' },
    4,
    9 / 16,
    [],
    'magnetar cosmic burst',
    true // allow fallback
  );

  assert.ok(
    portraitCandidate.score > landscapeCandidate.score,
    `Native vertical (${portraitCandidate.score}) must beat landscape (${landscapeCandidate.score}) even with perfect semantic match`
  );
});

test('B-Roll Scoring: High-resolution portrait beats low-resolution portrait', () => {
  const fullHd = BrollScorer.evaluateCandidate(
    { width: 1080, height: 1920, duration: 8 },
    5
  );
  const lowRes = BrollScorer.evaluateCandidate(
    { width: 480, height: 854, duration: 8 },
    5
  );

  assert.ok(
    fullHd.score > lowRes.score,
    `Full HD portrait (${fullHd.score}) must beat low-res portrait (${lowRes.score})`
  );
  assert.equal(fullHd.breakdown.resolution, 20);
  assert.equal(lowRes.breakdown.resolution, 5);
});

test('B-Roll Scoring: Penalizes clips shorter than requested duration', () => {
  const shortClip = BrollScorer.evaluateCandidate(
    { width: 1080, height: 1920, duration: 2 },
    6
  );
  const goodClip = BrollScorer.evaluateCandidate(
    { width: 1080, height: 1920, duration: 8 },
    6
  );
  assert.ok(
    goodClip.score > shortClip.score,
    `Good clip score (${goodClip.score}) should exceed short clip score (${shortClip.score})`
  );
  assert.equal(shortClip.breakdown.durationMatch, -25);
});

test('B-Roll Scoring: Heavy penalty for repeated clip asset ID', () => {
  const firstUse = BrollScorer.evaluateCandidate(
    { id: 'clip_999', width: 1080, height: 1920, duration: 8 },
    5,
    9 / 16,
    new Set()
  );
  const repeatUse = BrollScorer.evaluateCandidate(
    { id: 'clip_999', width: 1080, height: 1920, duration: 8 },
    5,
    9 / 16,
    new Set(['clip_999'])
  );

  assert.ok(
    firstUse.score - repeatUse.score >= 40,
    `Repeated clip should suffer >= 40 pts penalty (got ${firstUse.score} vs ${repeatUse.score})`
  );
  assert.equal(repeatUse.breakdown.uniqueness, -35);
});
