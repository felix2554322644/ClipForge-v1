import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import { pipelineOrchestrator } from '../src/server/orchestrator/PipelineOrchestrator.js';
import { PipelineInput } from '../src/types/pipeline.js';

test('PipelineOrchestrator executes full end-to-end pipeline and produces validated MP4', async () => {
  const testInput: PipelineInput = {
    topic: 'How Supernovas Create Gold in Space',
    desiredDurationSec: 8, // Short fast duration for test
    style: 'educational',
    resolutionProfile: '540x960', // Fast test resolution
    targetFps: 30,
  };

  const jobId = `test_e2e_${Date.now()}`;
  const job = await pipelineOrchestrator.executePipeline(testInput, jobId);

  assert.strictEqual(job.status, 'completed', 'Job should complete successfully');
  assert.strictEqual(job.progress, 100);
  assert.ok(job.finalVideoPath, 'Must have final video path');

  // Verify file actually exists and is non-empty on disk
  const stat = await fs.stat(job.finalVideoPath);
  assert.ok(stat.size > 50000, `Video file size should be substantial (got ${stat.size} bytes)`);

  // Verify all artifacts exist
  assert.ok(job.artifacts.research, 'Research artifact missing');
  assert.ok(job.artifacts.script, 'Script artifact missing');
  assert.ok(job.artifacts.narration, 'Narration artifact missing');
  assert.ok(job.artifacts.scenePlan, 'Scene plan artifact missing');
  assert.ok(job.artifacts.brollSelection, 'B-roll selection artifact missing');
  assert.ok(job.artifacts.timeline, 'Timeline artifact missing');
  assert.ok(job.artifacts.renderReport, 'Render report artifact missing');
  assert.ok(job.artifacts.validation, 'Validation artifact missing');

  // Verify ffprobe validation passed
  assert.strictEqual(job.artifacts.validation.passed, true, `Validation errors: ${job.artifacts.validation.errors.join('; ')}`);
  assert.strictEqual(job.artifacts.validation.checks.hasVideoStream, true);
  assert.strictEqual(job.artifacts.validation.checks.hasAudioStream, true);
  assert.strictEqual(job.artifacts.validation.checks.resolutionValid, true);
  assert.strictEqual(job.artifacts.validation.checks.aspectRatioValid, true);
  assert.strictEqual(job.artifacts.validation.checks.videoCodecValid, true);
  assert.strictEqual(job.artifacts.validation.checks.audioCodecValid, true);
  assert.strictEqual(job.artifacts.validation.metrics.width, 540);
  assert.strictEqual(job.artifacts.validation.metrics.height, 960);
});
