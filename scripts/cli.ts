import { VideoPipelineOrchestrator } from '../src/pipeline/orchestrator';
import { validateGeminiConfiguration } from '../src/config/index';

async function main() {
  const cliArg = process.argv[2];
  const envTopic = process.env.VIDEO_TOPIC;
  const requestedTopic = cliArg || envTopic || 'automatic';

  console.log('====================================================');
  console.log('  Autonomous AI Video Generator Pipeline (CLI)      ');
  console.log('====================================================');

  const geminiConfig = validateGeminiConfiguration();
  if (geminiConfig.warnings.length > 0) {
    geminiConfig.warnings.forEach((w) => console.warn(`[CONFIG WARNING] ${w}`));
  }

  const orchestrator = new VideoPipelineOrchestrator();
  const job = await orchestrator.runJob(requestedTopic);

  console.log('\nPipeline Result Summary:');
  console.log(`Job ID:     ${job.id}`);
  console.log(`Topic:      ${job.topic}`);
  console.log(`Topic Mode: ${job.topicMode}`);
  console.log(`Status:     ${job.status}`);
  console.log(`Duration:   ${job.duration}s`);
  console.log(`Profile:    ${job.profile}`);
  console.log(`Video:      ${job.finalVideoPath}`);
  console.log('Artifacts Directory:', job.outputDirectory);
}

main().catch((err) => {
  console.error('Fatal Pipeline Execution Error:', err);
  process.exit(1);
});
