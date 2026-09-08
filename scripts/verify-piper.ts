import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { loadConfig } from '../src/config/index';
import { AudioMeasurer } from '../src/services/narration/audioMeasurer';

export interface PiperVerificationResult {
  ok: boolean;
  piperBin: string;
  piperVersion?: string;
  modelPath: string;
  modelSizeMb?: number;
  modelConfigPath: string;
  testAudioDurationSec?: number;
  error?: string;
}

export function verifyPiperEnvironment(): PiperVerificationResult {
  console.log('=====================================================');
  console.log('       PIPER LOCAL TTS PRE-FLIGHT VERIFICATION       ');
  console.log('=====================================================');

  const config = loadConfig();
  const piperBin = config.piperBin;
  const modelPath = config.piperModel;
  const modelConfigPath = `${modelPath}.json`;

  console.log(`[1/5] Checking Piper executable: ${piperBin}`);

  // 1. Check binary existence
  if (!fs.existsSync(piperBin)) {
    const err = `CRITICAL: Piper binary not found at "${piperBin}". Run "bash scripts/setup-piper.sh" to download and install.`;
    console.error(`❌ ${err}`);
    return { ok: false, piperBin, modelPath, modelConfigPath, error: err };
  }

  // 2. Check binary execution (--version)
  let version = '';
  try {
    const proc = spawnSync(piperBin, ['--version'], { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' });
    if (proc.status !== 0) {
      const err = `CRITICAL: Piper binary failed execution with code ${proc.status}: ${proc.stderr || proc.stdout}`;
      console.error(`❌ ${err}`);
      return { ok: false, piperBin, modelPath, modelConfigPath, error: err };
    }
    version = (proc.stdout || proc.stderr || '').trim();
    console.log(`  ✔ Piper executable OK (Version: ${version})`);
  } catch (err: any) {
    const errMsg = `CRITICAL: Failed to spawn Piper binary at "${piperBin}": ${err.message || err}`;
    console.error(`❌ ${errMsg}`);
    return { ok: false, piperBin, modelPath, modelConfigPath, error: errMsg };
  }

  // 3. Check voice model existence and readability
  console.log(`[2/5] Checking Piper ONNX voice model: ${modelPath}`);
  if (!fs.existsSync(modelPath)) {
    const err = `CRITICAL: Voice model not found at "${modelPath}". Run "bash scripts/setup-piper.sh" to download the model.`;
    console.error(`❌ ${err}`);
    return { ok: false, piperBin, piperVersion: version, modelPath, modelConfigPath, error: err };
  }

  try {
    fs.accessSync(modelPath, fs.constants.R_OK);
  } catch (err: any) {
    const errMsg = `CRITICAL: Voice model at "${modelPath}" is not readable: ${err.message || err}`;
    console.error(`❌ ${errMsg}`);
    return { ok: false, piperBin, piperVersion: version, modelPath, modelConfigPath, error: errMsg };
  }

  const stat = fs.statSync(modelPath);
  const sizeMb = stat.size / (1024 * 1024);
  if (stat.size < 10 * 1024 * 1024) {
    const err = `CRITICAL: Voice model file size is suspiciously small (${sizeMb.toFixed(2)} MB). File may be corrupted or truncated.`;
    console.error(`❌ ${err}`);
    return { ok: false, piperBin, piperVersion: version, modelPath, modelSizeMb: sizeMb, modelConfigPath, error: err };
  }
  console.log(`  ✔ Model file verified readable (${sizeMb.toFixed(2)} MB)`);

  // 4. Check companion model config JSON
  console.log(`[3/5] Checking model configuration: ${modelConfigPath}`);
  if (!fs.existsSync(modelConfigPath)) {
    const err = `CRITICAL: Model configuration JSON not found at "${modelConfigPath}".`;
    console.error(`❌ ${err}`);
    return { ok: false, piperBin, piperVersion: version, modelPath, modelSizeMb: sizeMb, modelConfigPath, error: err };
  }

  try {
    const configRaw = fs.readFileSync(modelConfigPath, 'utf-8');
    const parsed = JSON.parse(configRaw);
    console.log(`  ✔ Model config verified (Sample rate: ${parsed.audio?.sample_rate || 'unknown'}Hz, Quality: ${parsed.dataset || 'standard'})`);
  } catch (err: any) {
    const errMsg = `CRITICAL: Model config JSON is invalid: ${err.message || err}`;
    console.error(`❌ ${errMsg}`);
    return { ok: false, piperBin, piperVersion: version, modelPath, modelSizeMb: sizeMb, modelConfigPath, error: errMsg };
  }

  // 5. Functional synthesis test
  console.log('[4/5] Executing micro-synthesis audio test...');
  const testWavPath = path.join(os.tmpdir(), `piper_preflight_test_${Date.now()}.wav`);
  const testPhrase = 'Piper local text-to-speech runtime initialization verified.';

  try {
    const synthProc = spawnSync(
      piperBin,
      ['--model', modelPath, '--output_file', testWavPath],
      {
        input: testPhrase,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    if (synthProc.status !== 0) {
      const err = `CRITICAL: Test synthesis failed with exit code ${synthProc.status}: ${synthProc.stderr}`;
      console.error(`❌ ${err}`);
      return { ok: false, piperBin, piperVersion: version, modelPath, modelSizeMb: sizeMb, modelConfigPath, error: err };
    }

    if (!fs.existsSync(testWavPath) || fs.statSync(testWavPath).size === 0) {
      const err = `CRITICAL: Piper did not produce valid output audio at "${testWavPath}".`;
      console.error(`❌ ${err}`);
      return { ok: false, piperBin, piperVersion: version, modelPath, modelSizeMb: sizeMb, modelConfigPath, error: err };
    }

    console.log('[5/5] Measuring test audio with FFprobe...');
    const measurer = new AudioMeasurer(config.ffprobeBin);
    const probe = measurer.probeAudio(testWavPath);

    console.log(`  ✔ Generated valid WAV: ${probe.durationSec}s, ${probe.sampleRate}Hz, ${probe.channels}ch`);
    console.log('=====================================================');
    console.log('       PIPER PRE-FLIGHT VERIFICATION: PASSED         ');
    console.log('=====================================================\n');

    return {
      ok: true,
      piperBin,
      piperVersion: version,
      modelPath,
      modelSizeMb: sizeMb,
      modelConfigPath,
      testAudioDurationSec: probe.durationSec,
    };
  } catch (err: any) {
    const errMsg = `CRITICAL: Functional audio verification failed: ${err.message || err}`;
    console.error(`❌ ${errMsg}`);
    return { ok: false, piperBin, piperVersion: version, modelPath, modelSizeMb: sizeMb, modelConfigPath, error: errMsg };
  } finally {
    try {
      if (fs.existsSync(testWavPath)) {
        fs.unlinkSync(testWavPath);
      }
    } catch {
      // ignore cleanup error
    }
  }
}

// When executed directly: exit with proper code
const isDirectRun = process.argv[1]?.endsWith('verify-piper.ts') || process.argv[1]?.endsWith('verify-piper.js');
if (isDirectRun) {
  const result = verifyPiperEnvironment();
  if (!result.ok) {
    process.exit(1);
  }
  process.exit(0);
}
