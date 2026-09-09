import { VideoPipelineOrchestrator } from '../src/pipeline/orchestrator';
import { CONFIG } from '../src/config/index';

async function main() {
  const topic = process.argv[2] || process.env.VIDEO_TOPIC || 'The Mystery of Deep Space Fast Radio Bursts';

  console.log('====================================================');
  console.log('  Autonomous AI Video Generator Pipeline (CLI)      ');
  console.log('====================================================');
  console.log(`Topic: ${topic}`);

  const orchestrator = new VideoPipelineOrchestrator();
  const job = await orchestrator.runJob(topic);

  console.log('\nPipeline Result Summary:');
  console.log(`Job ID: ${job.id}`);
  console.log(`Status: ${job.status}`);
  console.log(`Video:  ${job.finalVideoPath}`);
  console.log('Artifacts Directory:', job.outputDirectory);
}

main().catch((err) => {
  console.error('Fatal Pipeline Execution Error:', err);
  process.exit(1);
});
