import { pipelineOrchestrator } from '../src/server/orchestrator/PipelineOrchestrator.js';
import { PipelineInput } from '../src/types/pipeline.js';

async function main() {
  const args = process.argv.slice(2);
  const topicArg = args.find(a => !a.startsWith('--')) || 'How black holes destroy stars';

  console.log('='.repeat(60));
  console.log('🎬 LEAN AI VIDEO GENERATOR V1 - CLI RUNNER');
  console.log('='.repeat(60));
  console.log(`Topic: "${topicArg}"`);

  const input: PipelineInput = {
    topic: topicArg,
    desiredDurationSec: 18,
    style: 'educational',
    resolutionProfile: '1080x1920',
  };

  try {
    const job = await pipelineOrchestrator.executePipeline(input);
    console.log('\n' + '='.repeat(60));
    console.log('🎉 PIPELINE COMPLETED SUCCESSFULLY!');
    console.log(`Job ID: ${job.jobId}`);
    console.log(`Final Video: ${job.finalVideoPath}`);
    console.log(`Duration: ${job.artifacts.validation?.metrics.actualDurationSec}s`);
    console.log(`Resolution: ${job.artifacts.validation?.metrics.width}x${job.artifacts.validation?.metrics.height}`);
    console.log(`Codecs: Video=${job.artifacts.validation?.metrics.videoCodec}, Audio=${job.artifacts.validation?.metrics.audioCodec}`);
    console.log('='.repeat(60));
  } catch (err: any) {
    console.error('\n❌ PIPELINE EXECUTION FAILED:', err.message);
    process.exit(1);
  }
}

main();
