import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiTaskRouter } from '../src/services/gemini/taskRouter';

test('GeminiTaskRouter: Routes tasks to primary slot affinity when all slots are healthy', () => {
  const router = new GeminiTaskRouter({
    slotsConfigured: [
      { slot: 1, id: 'KEY_1', configured: true, projectId: 'clipforge-proj' },
      { slot: 2, id: 'KEY_2', configured: true, projectId: 'clipforge-proj' },
      { slot: 3, id: 'KEY_3', configured: true, projectId: 'clipforge-proj' },
    ],
  });

  // Topic / Research operations -> Slot 1
  const topicDecision = router.routeTask('topic_expansion');
  assert.strictEqual(topicDecision.selectedSlotIndex, 0);
  assert.strictEqual(topicDecision.selectedKeyId, 'KEY_1');
  assert.strictEqual(topicDecision.isFallback, false);

  const researchDecision = router.routeTask('research_claims');
  assert.strictEqual(researchDecision.selectedSlotIndex, 0);
  assert.strictEqual(researchDecision.selectedKeyId, 'KEY_1');

  // Scriptwriting / Storyboarding -> Slot 2
  const scriptDecision = router.routeTask('scriptwriting');
  assert.strictEqual(scriptDecision.selectedSlotIndex, 1);
  assert.strictEqual(scriptDecision.selectedKeyId, 'KEY_2');

  const storyboardDecision = router.routeTask('storyboard');
  assert.strictEqual(storyboardDecision.selectedSlotIndex, 1);
  assert.strictEqual(storyboardDecision.selectedKeyId, 'KEY_2');

  // B-roll / Grounding / QC -> Slot 3
  const brollDecision = router.routeTask('broll_scoring');
  assert.strictEqual(brollDecision.selectedSlotIndex, 2);
  assert.strictEqual(brollDecision.selectedKeyId, 'KEY_3');

  const qcDecision = router.routeTask('final_qc', true);
  assert.strictEqual(qcDecision.selectedSlotIndex, 2);
  assert.strictEqual(qcDecision.selectedKeyId, 'KEY_3');
});

test('GeminiTaskRouter: Fails over to healthiest alternative slot when preferred slot hits 429', () => {
  const router = new GeminiTaskRouter({
    slotsConfigured: [
      { slot: 1, id: 'KEY_1', configured: true, projectId: 'clipforge-proj' },
      { slot: 2, id: 'KEY_2', configured: true, projectId: 'clipforge-proj' },
      { slot: 3, id: 'KEY_3', configured: true, projectId: 'clipforge-proj' },
    ],
    cooldownMs: 60000,
  });

  // Slot 1 hits 429
  router.record429(0);
  assert.strictEqual(router.isSlotCoolingDown(0), true);

  // Task for Slot 1 should fail over to Slot 2 or Slot 3
  const failoverDecision = router.routeTask('topic_expansion');
  assert.notStrictEqual(failoverDecision.selectedSlotIndex, 0);
  assert.strictEqual(failoverDecision.isFallback, true);
  assert.ok(
    failoverDecision.selectedSlotIndex === 1 || failoverDecision.selectedSlotIndex === 2,
    'Should route to an available healthy slot'
  );
});

test('GeminiTaskRouter: Incorporates multimodal weighting into workload scoring', () => {
  const router = new GeminiTaskRouter({
    slotsConfigured: [
      { slot: 1, id: 'KEY_1', configured: true, projectId: 'clipforge-proj' },
      { slot: 2, id: 'KEY_2', configured: true, projectId: 'clipforge-proj' },
      { slot: 3, id: 'KEY_3', configured: true, projectId: 'clipforge-proj' },
    ],
  });

  // Slot 2 has a standard text request
  router.recordSuccess(1, 'scriptwriting', false, 1000);

  // Slot 3 processes heavy multimodal QC requests
  router.recordSuccess(2, 'final_qc', true, 1000);

  const metrics = router.getMetrics();
  assert.strictEqual(metrics[2].multimodalWorkload, 1);
  assert.strictEqual(metrics[1].multimodalWorkload, 0);

  // Workload score for Slot 3 reflects multimodal weight
  const scoreSlot2 = router.calculateWorkloadScore(1);
  const scoreSlot3 = router.calculateWorkloadScore(2);
  assert.ok(scoreSlot3 > scoreSlot2, 'Multimodal workload score should exceed text-only score');
});

test('GeminiTaskRouter: Generates a clear operational report', () => {
  const router = new GeminiTaskRouter({
    slotsConfigured: [
      { slot: 1, id: 'KEY_1', configured: true, projectId: 'clipforge-proj' },
      { slot: 2, id: 'KEY_2', configured: true, projectId: 'clipforge-proj' },
      { slot: 3, id: 'KEY_3', configured: true, projectId: 'clipforge-proj' },
    ],
  });

  router.recordSuccess(0, 'topic_expansion', false, 500);
  router.recordSuccess(1, 'scriptwriting', false, 800);
  router.recordSuccess(2, 'broll_scoring', true, 1200);

  const report = router.generateReport();
  assert.ok(report.includes('GEMINI 3-KEY TASK ROUTING REPORT'), 'Report should include header');
  assert.ok(report.includes('KEY_1 (PRIMARY (Topic / Research / Factual Extraction))'), 'Report should include Slot 1 role');
  assert.ok(report.includes('KEY_2 (SECONDARY (Story / Script / Storyboard / Retention))'), 'Report should include Slot 2 role');
  assert.ok(report.includes('KEY_3 (TERTIARY (Multimodal B-roll / Continuity / Visual QC))'), 'Report should include Slot 3 role');
  assert.ok(report.includes('Success: 1'), 'Report should display success count');
});
