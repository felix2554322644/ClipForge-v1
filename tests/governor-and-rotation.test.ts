import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiUsageGovernor } from '../src/services/governor/usageGovernor';
import { GeminiClient } from '../src/services/gemini/client';
import { VisualGroundingService } from '../src/services/editorial/visualGrounding';
import { BrollSearcher } from '../src/services/broll/searcher';
import { BrollCandidateBoard, CandidateBrollAsset } from '../src/types/editorial';
import { Storyboard } from '../src/types/storyboard';

function createMockCandidate(id: string): CandidateBrollAsset {
  return {
    id,
    provider: 'pexels',
    providerAssetId: id,
    sourceUrl: `https://pexels.com/video/${id}`,
    downloadUrl: `/tmp/${id}.mp4`,
    durationSeconds: 8.0,
    width: 1080,
    height: 1920,
    aspectRatio: 1080 / 1920,
    nativeVertical: true,
    tags: ['curiosity', 'test'],
    queryUsed: 'curiosity test',
    relevanceScore: 85,
    targetSceneIndex: 0,
    targetShotId: 'shot_1',
    thumbnailUrl: `https://pexels.com/thumb/${id}.jpg`,
    thumbnailBase64: 'data:image/jpeg;base64,fakeBase64',
  };
}

test('GeminiUsageGovernor: Enforces max total Gemini request limit (12)', () => {
  const governor = new GeminiUsageGovernor({ maxGeminiRequests: 12 });

  // 12 requests permitted
  for (let i = 0; i < 12; i++) {
    const check = governor.canMakeRequest('research');
    assert.strictEqual(check.allowed, true);
    governor.recordRequest('research', 'key_1', 'proj_1');
  }

  assert.strictEqual(governor.getStats().totalRequests, 12);

  // 13th request blocked
  const check13 = governor.canMakeRequest('director');
  assert.strictEqual(check13.allowed, false);
  assert.match(check13.reason || '', /budget exhausted/i);
});

test('GeminiUsageGovernor: Enforces candidate search rounds (max 2) and candidate bounds', () => {
  const governor = new GeminiUsageGovernor({
    maxSearchRounds: 2,
    maxCandidatesTotal: 20,
    maxCandidatesPerSearch: 10,
  });

  assert.strictEqual(governor.canSearchAgain(), true);

  // Round 1
  const round1 = governor.recordSearchRound();
  assert.strictEqual(round1.allowed, true);
  assert.strictEqual(round1.maxAllowedThisRound, 10);
  governor.recordCandidatesRetrieved(10);
  assert.strictEqual(governor.getStats().candidatesRetrieved, 10);

  assert.strictEqual(governor.canSearchAgain(), true);

  // Round 2
  const round2 = governor.recordSearchRound();
  assert.strictEqual(round2.allowed, true);
  assert.strictEqual(round2.maxAllowedThisRound, 10);
  governor.recordCandidatesRetrieved(10);
  assert.strictEqual(governor.getStats().candidatesRetrieved, 20);

  // Round 3 blocked
  assert.strictEqual(governor.canSearchAgain(), false);
  const round3 = governor.recordSearchRound();
  assert.strictEqual(round3.allowed, false);
  assert.strictEqual(round3.maxAllowedThisRound, 0);
});

test('GeminiUsageGovernor: Enforces candidate multimodal evaluations (max 12) & frame deduplication', () => {
  const governor = new GeminiUsageGovernor({ maxCandidateEvaluations: 12 });

  // Evaluate 12 unique candidates
  for (let i = 1; i <= 12; i++) {
    const id = `candidate_${i}`;
    assert.strictEqual(governor.canEvaluateCandidate(id), true);
    const recorded = governor.recordCandidateEvaluation(id);
    assert.strictEqual(recorded, true);
  }

  assert.strictEqual(governor.getStats().candidateEvaluations, 12);

  // 13th unique candidate blocked
  assert.strictEqual(governor.canEvaluateCandidate('candidate_13'), false);
  assert.strictEqual(governor.recordCandidateEvaluation('candidate_13'), false);

  // Re-evaluating candidate_1 must be recognized as already evaluated and not double count
  assert.strictEqual(governor.hasCandidateBeenEvaluated('candidate_1'), true);
  assert.strictEqual(governor.canEvaluateCandidate('candidate_1'), false);
  assert.strictEqual(governor.recordCandidateEvaluation('candidate_1'), false);
  assert.strictEqual(governor.getStats().candidateEvaluations, 12);
});

test('GeminiUsageGovernor: Enforces director calls (max 2) and QC calls (max 1)', () => {
  const governor = new GeminiUsageGovernor({
    maxDirectorCalls: 2,
    maxQcCalls: 1,
    maxGeminiRequests: 12,
  });

  // Director call 1 (decision)
  assert.strictEqual(governor.canCallDirector(), true);
  governor.recordRequest('director_decision');

  // Director call 2 (refinement)
  assert.strictEqual(governor.canCallDirector(), true);
  governor.recordRequest('director_refinement');

  // Director call 3 blocked
  assert.strictEqual(governor.canCallDirector(), false);
  assert.strictEqual(governor.canMakeRequest('director_decision').allowed, false);

  // QC call 1
  assert.strictEqual(governor.canCallQc(), true);
  governor.recordRequest('qc_review');

  // QC call 2 blocked
  assert.strictEqual(governor.canCallQc(), false);
  assert.strictEqual(governor.canMakeRequest('qc_review').allowed, false);
});

test('GeminiUsageGovernor: End-of-run report string matches required format', () => {
  const governor = new GeminiUsageGovernor();

  governor.recordRequest('topic', 'key_1', 'my-gcp-project');
  governor.recordRequest('research', 'key_1', 'my-gcp-project');
  governor.recordRequest('script', 'key_1', 'my-gcp-project');
  governor.recordRequest('storyboard', 'key_1', 'my-gcp-project');
  governor.recordRequest('director_decision', 'key_2', 'my-gcp-project');
  governor.recordRequest('qc_review', 'key_2', 'my-gcp-project');

  governor.recordSearchRound();
  governor.recordCandidatesRetrieved(10);
  governor.recordCandidateEvaluation('asset_1');
  governor.recordCandidateEvaluation('asset_2');

  const report = governor.generateReportString({ keysRotated: 1, activeKeyIndex: 1 });

  assert.match(report, /--- CLIPFORGE GEMINI USAGE REPORT ---/);
  assert.match(report, /Total Gemini requests: 6 \/ 12/);
  assert.match(report, /Requests by operation:/);
  assert.match(report, /- topic: 1/);
  assert.match(report, /- research: 1/);
  assert.match(report, /- script: 1/);
  assert.match(report, /- storyboard: 1/);
  assert.match(report, /- director: 1/);
  assert.match(report, /- qc: 1/);
  assert.match(report, /Candidate search rounds: 1 \/ 2/);
  assert.match(report, /Candidates retrieved: 10 \/ 20/);
  assert.match(report, /Candidates evaluated: 2 \/ 12/);
  assert.match(report, /Keys rotated: 1/);
  assert.match(report, /Active key index: 1/);
  assert.match(report, /Project ID\(s\) used: \[my-gcp-project\]/);
  assert.match(report, /Status: WITHIN_BUDGET/);
  assert.match(report, /-------------------------------------/);
});

test('GeminiClient: Intelligent 3-Key failover rotates on 429 and records rate limits', async () => {
  const governor = new GeminiUsageGovernor();
  let keyAttempts: string[] = [];

  const client = new GeminiClient({
    keys: ['test-key-1', 'test-key-2', 'test-key-3'],
    primaryProjectId: 'proj-alpha',
    secondaryProjectId: 'proj-alpha',
    tertiaryProjectId: 'proj-alpha',
    governor,
    customRunner: async (keyLabel, prompt, attempt) => {
      keyAttempts.push(keyLabel);
      if (keyLabel === 'PRIMARY') {
        const err = new Error('Resource has been exhausted (e.g. check quota).');
        (err as any).status = 429;
        throw err;
      }
      return JSON.stringify({ message: 'Success from failover key' });
    },
  });

  const result = await client.executeWithFailover('Hello test');
  assert.match(result, /Success from failover key/);

  // Key 1 attempted first, then failed over to Key 2
  assert.strictEqual(keyAttempts[0], 'PRIMARY');
  assert.strictEqual(keyAttempts[1], 'SECONDARY');

  // Governor stats reflect 429 and successful request
  const stats = governor.getStats();
  assert.strictEqual(stats.rateLimit429Count, 1);
  assert.strictEqual(stats.totalRequests, 1);
});

test('VisualGroundingService: Deduplicates candidate frames across search rounds', async () => {
  const governor = new GeminiUsageGovernor({ maxCandidateEvaluations: 4 });
  const visualGrounding = new VisualGroundingService({ governor });

  VisualGroundingService.clearFrameCache();

  const board: BrollCandidateBoard = {
    totalCandidates: 3,
    candidates: [
      createMockCandidate('cand_a'),
      createMockCandidate('cand_b'),
      createMockCandidate('cand_c'),
    ],
    queriesRun: ['test'],
    visualThemesSummary: ['science'],
  };

  const framesAcquired = await visualGrounding.acquireFramesForCandidateBoard(board);
  assert.strictEqual(framesAcquired, 3); // cand_a, cand_b, cand_c
  assert.strictEqual(governor.getStats().candidateEvaluations, 3);

  // Calling again with same board should use cache and not increment evaluations
  const cachedAcquired = await visualGrounding.acquireFramesForCandidateBoard(board);
  assert.strictEqual(cachedAcquired, 3); // 3 frames attached from cache
  assert.strictEqual(governor.getStats().candidateEvaluations, 3); // 0 new evaluations (quota preserved)
});

test('BrollSearcher: Respects governor candidate limit when building candidate board', async () => {
  const governor = new GeminiUsageGovernor({
    maxSearchRounds: 2,
    maxCandidatesTotal: 6,
    maxCandidatesPerSearch: 4,
  });

  const brollSearcher = new BrollSearcher(undefined, { governor });

  const storyboard: Storyboard = {
    title: 'Test Storyboard',
    format: 'short',
    totalDurationSeconds: 4,
    totalShots: 1,
    generatedBy: 'deterministic_fallback',
    shots: [
      {
        shotId: 'shot_1',
        sceneIndex: 0,
        shotIndex: 0,
        narrationStart: 0,
        narrationEnd: 4,
        durationSeconds: 4,
        narrationClause: 'Test',
        visualSubject: 'deep space galaxy',
        action: 'spinning galaxy',
        environment: 'space',
        emotion: 'wonder',
        framing: 'wide',
        cameraMovement: 'slow_drift',
        visualPurpose: 'hook',
        visualPriority: 'critical',
        preferredVisualType: 'stock',
        searchQueries: ['curiosity test', 'brain puzzle'],
      },
    ],
  };

  const board = await brollSearcher.buildCandidateBoard(storyboard);

  // Board should not exceed governor's candidates retrieved limit
  assert.ok(board.candidates.length <= 6);
  assert.strictEqual(governor.getStats().searchRounds, 1);
});
