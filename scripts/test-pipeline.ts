import fs from 'fs/promises';
import path from 'path';
import { pipelineOrchestrator } from '../src/server/orchestrator/PipelineOrchestrator.js';
import { PipelineInput } from '../src/types/pipeline.js';

async function runPipelineTest() {
  console.log('--- STARTING END-TO-END PIPELINE TEST ---');

  const testInput: PipelineInput = {
    topic: 'Stellar Nucleosynthesis: How Stars Forge Elements',
    desiredDurationSec: 12,
    style: 'dramatic',
    resolutionProfile: '540x960', // Fast vertical test resolution
    targetFps: 30,
  };

  const testJobId = `test_e2e_${Date.now()}`;

  try {
    const job = await pipelineOrchestrator.executePipeline(testInput, testJobId);

    if (job.status !== 'completed') {
      throw new Error(`Pipeline did not complete. Status: ${job.status}`);
    }

    if (!job.finalVideoPath) {
      throw new Error('No finalVideoPath produced');
    }

    await fs.access(job.finalVideoPath);

    const val = job.artifacts.validation;
    if (!val || !val.passed) {
      throw new Error(`Validation failed: ${JSON.stringify(val?.errors)}`);
    }

    console.log('✅ End-to-End Pipeline Test PASSED!');
    console.log(`- Video File: ${job.finalVideoPath}`);
    console.log(`- Dimensions: ${val.metrics.width}x${val.metrics.height}`);
    console.log(`- Duration: ${val.metrics.actualDurationSec}s`);
    console.log(`- Codecs: ${val.metrics.videoCodec} / ${val.metrics.audioCodec}`);
    console.log(`- Artifacts generated: ${Object.keys(job.artifacts).join(', ')}`);
  } catch (err: any) {
    console.error('❌ End-to-End Pipeline Test FAILED:', err);
    process.exit(1);
  }
}

runPipelineTest();
