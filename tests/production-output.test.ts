import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ARTIFACT_FILES } from '../src/contracts/artifacts';
import { VideoPipelineOrchestrator } from '../src/pipeline/orchestrator';

test('ProductionOutput: Contract specifies clean production MP4 artifact', () => {
  assert.equal(ARTIFACT_FILES.PRODUCTION_MP4, 'clipforge-final.mp4');
  assert.equal(ARTIFACT_FILES.FINAL_VIDEO, 'final-video.mp4');
});

test('ProductionOutput: exportProductionDeliverable packages ONLY the final MP4', () => {
  const orchestrator = new VideoPipelineOrchestrator();

  const testDir = path.join('/tmp', `test_prod_${Date.now()}`);
  const jobDir = path.join(testDir, 'job_intermediate');
  const prodDir = path.join(testDir, 'production_output');

  fs.mkdirSync(jobDir, { recursive: true });
  fs.mkdirSync(prodDir, { recursive: true });

  // Create mock intermediate pipeline files
  fs.writeFileSync(path.join(jobDir, 'research.json'), '{"topic":"cosmos"}');
  fs.writeFileSync(path.join(jobDir, 'script.json'), '{"scenes":[]}');
  fs.writeFileSync(path.join(jobDir, 'narration.wav'), 'RIFF mock audio');
  fs.writeFileSync(path.join(jobDir, 'timeline.json'), '{"cuts":[]}');
  fs.writeFileSync(path.join(jobDir, 'cut_0_0.mp4'), 'mock cut 1');
  fs.writeFileSync(path.join(jobDir, 'cut_1_0.mp4'), 'mock cut 2');

  // Create the mock final rendered MP4
  const mockFinalVideoPath = path.join(jobDir, 'final-video.mp4');
  fs.writeFileSync(mockFinalVideoPath, 'MP4 final video stream binary bytes');

  // Export production deliverable
  const exportedPath = orchestrator.exportProductionDeliverable(mockFinalVideoPath, prodDir);

  assert.equal(path.basename(exportedPath), 'clipforge-final.mp4');
  assert.ok(fs.existsSync(exportedPath), 'clipforge-final.mp4 must exist in destination');

  // Verify that the production deliverable directory contains ONLY the final MP4
  const prodFiles = fs.readdirSync(prodDir);
  assert.deepEqual(
    prodFiles,
    ['clipforge-final.mp4'],
    'Production deliverable directory MUST contain ONLY clipforge-final.mp4'
  );

  // Clean up
  fs.rmSync(testDir, { recursive: true, force: true });
});
