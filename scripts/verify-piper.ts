import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const PIPER_PATH = path.resolve(ROOT_DIR, 'bin/piper/piper');
const MODEL_PATH = path.resolve(ROOT_DIR, 'models/en_US-lessac-medium.onnx');
const CONFIG_PATH = path.resolve(ROOT_DIR, 'models/en_US-lessac-medium.onnx.json');

console.log('--- Starting Pre-flight Piper Verification ---');

// 1. Binary Check
console.log(`Checking Piper executable at: ${PIPER_PATH}`);
if (!fs.existsSync(PIPER_PATH)) {
  console.error(`❌ Piper binary not found at: ${PIPER_PATH}`);
  process.exit(1);
}

try {
  fs.accessSync(PIPER_PATH, fs.constants.X_OK);
  const version = execSync(`"${PIPER_PATH}" --version`, { encoding: 'utf-8' }).trim();
  console.log(`✅ Piper binary executable, version: ${version}`);
} catch (err) {
  console.error(`❌ Piper binary execution failed:`, err);
  process.exit(1);
}

// 2. Model Check
console.log(`Checking voice model at: ${MODEL_PATH}`);
if (!fs.existsSync(MODEL_PATH)) {
  console.error(`❌ Voice model not found at: ${MODEL_PATH}`);
  process.exit(1);
}

const stats = fs.statSync(MODEL_PATH);
if (stats.size < 10 * 1024 * 1024) {
  console.error(`❌ Voice model file too small (${stats.size} bytes). Expected > 10MB`);
  process.exit(1);
}
console.log(`✅ Voice model verified (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

// 3. Config Check
console.log(`Checking model config at: ${CONFIG_PATH}`);
if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`❌ Voice model config not found at: ${CONFIG_PATH}`);
  process.exit(1);
}

try {
  const configRaw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(configRaw);
  const sampleRate = config.audio?.sample_rate || 22050;
  console.log(`✅ Voice model config valid. Audio sample rate: ${sampleRate} Hz`);
} catch (err) {
  console.error(`❌ Failed to parse voice model JSON config:`, err);
  process.exit(1);
}

// 4. Functional Synthesis & FFprobe Check
const tmpDir = path.resolve(ROOT_DIR, 'cache');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}
const testAudioPath = path.resolve(tmpDir, `verify_piper_test_${Date.now()}.wav`);

try {
  console.log('Running test synthesis with Piper...');
  const testText = 'Pre-flight Piper voice synthesis verification passed.';
  execSync(`echo "${testText}" | "${PIPER_PATH}" --model "${MODEL_PATH}" --output_file "${testAudioPath}"`, {
    stdio: 'pipe',
  });

  if (!fs.existsSync(testAudioPath) || fs.statSync(testAudioPath).size === 0) {
    throw new Error('Synthesized audio file was not created or is empty.');
  }

  // Probe audio duration and format using ffprobe
  const ffprobeCmd = `ffprobe -v error -show_entries format=duration,format_name:stream=codec_name,sample_rate,channels -of json "${testAudioPath}"`;
  const probeOutput = execSync(ffprobeCmd, { encoding: 'utf-8' });
  const probeData = JSON.parse(probeOutput);

  const duration = parseFloat(probeData.format?.duration || '0');
  const stream = probeData.streams?.[0];

  console.log(`✅ Synthesis verified:`);
  console.log(`   Duration: ${duration.toFixed(2)}s`);
  console.log(`   Codec: ${stream?.codec_name}`);
  console.log(`   Sample Rate: ${stream?.sample_rate} Hz`);
  console.log(`   Channels: ${stream?.channels}`);

  if (duration <= 0.5) {
    throw new Error(`Synthesized audio duration too short: ${duration}s`);
  }

  console.log('🎉 Pre-flight Piper verification completed successfully!');
} catch (err) {
  console.error(`❌ Audio synthesis test failed:`, err);
  process.exit(1);
} finally {
  if (fs.existsSync(testAudioPath)) {
    fs.unlinkSync(testAudioPath);
  }
}
