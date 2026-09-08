import { PipelineOrchestrator } from '../pipeline/orchestrator';
import { PipelineInput } from '../contracts/pipeline';

export async function runCli(args: string[]) {
  console.log(`
=====================================================
   GITHUB-NATIVE AI VIDEO GENERATOR V1 (CLI)
=====================================================
`);

  let topic = '';
  let duration = 24;
  let profile = 'vertical-1080';
  let outDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--duration' && args[i + 1]) {
      duration = parseInt(args[++i], 10);
    } else if (arg === '--profile' && args[i + 1]) {
      profile = args[++i];
    } else if (arg === '--outDir' && args[i + 1]) {
      outDir = args[++i];
    } else if (arg === '--topic' && args[i + 1]) {
      topic = args[++i];
    } else if (!arg.startsWith('-') && !topic) {
      topic = arg;
    }
  }

  if (!topic) {
    console.error('Error: Please provide a video topic.\n');
    console.log('Usage:');
    console.log('  npm run generate -- "How black holes destroy stars"');
    console.log('  npm run generate -- --topic "How black holes destroy stars" --duration 30 --profile vertical-1080\n');
    console.log('Options:');
    console.log('  --duration <sec>     Target duration in seconds (default: 24)');
    console.log('  --profile <profile>  Video profile (vertical-1080, vertical-720, vertical-540)');
    console.log('  --outDir <path>      Custom directory for output artifacts');
    process.exit(1);
  }

  const input: PipelineInput = {
    topic,
    duration,
    profile,
    outputDir: outDir,
  };

  try {
    const orchestrator = new PipelineOrchestrator();
    const result = await orchestrator.run(input);

    console.log(`
=====================================================
   GENERATION COMPLETE
=====================================================
Job ID:         ${result.jobId}
Final MP4:      ${result.finalVideoPath}
Duration:       ${result.totalDurationSec}s
Validation:     ${result.validationPassed ? 'PASSED (FFprobe Verified)' : 'FAILED'}
Artifacts:      ${result.artifactDir}
=====================================================
`);
    process.exit(0);
  } catch (err: any) {
    console.error(`\nGeneration Pipeline Failed: ${err.message || err}\n`);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1]?.endsWith('cli/index.ts') || process.argv[1]?.endsWith('cli/index.js');
if (isDirectRun) {
  runCli(process.argv.slice(2));
}
