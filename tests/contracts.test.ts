import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CONFIG } from '../src/config/index';
import { ARTIFACT_FILES, getArtifactPath } from '../src/contracts/artifacts';
import { AudioMeasurer } from '../src/services/narration/audioMeasurer';
import { GeminiClient } from '../src/services/gemini/client';

test('Contracts: Gemini model defaults to gemini-3.6-flash and is centralized', () => {
  assert.equal(CONFIG.GEMINI_MODEL, process.env.GEMINI_MODEL || 'gemini-3.6-flash');
  const client = new GeminiClient();
  assert.equal(client.getModel(), process.env.GEMINI_MODEL || 'gemini-3.6-flash');

  const customClient = new GeminiClient('custom-model-override');
  assert.equal(customClient.getModel(), 'custom-model-override');
});

test('Contracts: Piper executable exists and functions', () => {
  assert.ok(fs.existsSync(CONFIG.PIPER_PATH), `Piper executable missing at ${CONFIG.PIPER_PATH}`);
  fs.accessSync(CONFIG.PIPER_PATH, fs.constants.X_OK);
  const version = execSync(`"${CONFIG.PIPER_PATH}" --version`, { encoding: 'utf-8' }).trim();
  assert.match(version, /^\d+\.\d+\.\d+/, `Unexpected Piper version string: ${version}`);
});

test('Contracts: Piper voice model exists and exceeds 10MB', () => {
  assert.ok(fs.existsSync(CONFIG.PIPER_MODEL_PATH), `Voice model missing at ${CONFIG.PIPER_MODEL_PATH}`);
  const stats = fs.statSync(CONFIG.PIPER_MODEL_PATH);
  assert.ok(stats.size > 10 * 1024 * 1024, `Model size too small: ${stats.size} bytes`);
});

test('Contracts: Piper companion config contains valid audio sample rate', () => {
  const configPath = `${CONFIG.PIPER_MODEL_PATH}.json`;
  assert.ok(fs.existsSync(configPath), `Model config missing at ${configPath}`);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  assert.ok(config.audio?.sample_rate >= 16000, `Sample rate should be >= 16000, got ${config.audio?.sample_rate}`);
});

test('Contracts: Artifact files mapping matches specification', () => {
  assert.equal(ARTIFACT_FILES.JOB, 'job.json');
  assert.equal(ARTIFACT_FILES.NARRATION_WAV, 'narration.wav');
  assert.equal(ARTIFACT_FILES.FINAL_VIDEO, 'final-video.mp4');
  assert.equal(ARTIFACT_FILES.VALIDATION, 'validation.json');

  const p = getArtifactPath('/tmp/testjob', 'FINAL_VIDEO');
  assert.equal(p, '/tmp/testjob/final-video.mp4');
});

test('Contracts: Piper speech synthesis produces valid measurable audio', () => {
  if (!fs.existsSync(CONFIG.CACHE_DIR)) {
    fs.mkdirSync(CONFIG.CACHE_DIR, { recursive: true });
  }
  const outWav = path.join(CONFIG.CACHE_DIR, `test_speech_${Date.now()}.wav`);
  try {
    execSync(`echo "Audio contract test passed." | "${CONFIG.PIPER_PATH}" --model "${CONFIG.PIPER_MODEL_PATH}" --output_file "${outWav}"`, {
      stdio: 'pipe',
    });
    assert.ok(fs.existsSync(outWav), 'Synthesized file was not created');
    const probe = AudioMeasurer.probe(outWav);
    assert.ok(probe.durationSeconds > 0.5, `Duration too short: ${probe.durationSeconds}s`);
    assert.equal(probe.sampleRate, 22050, `Sample rate should be 22050Hz`);
    assert.equal(probe.channels, 1, 'Channels should be 1');
  } finally {
    if (fs.existsSync(outWav)) fs.unlinkSync(outWav);
  }
});
