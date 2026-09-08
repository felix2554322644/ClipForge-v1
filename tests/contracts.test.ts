import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { VIDEO_PROFILES, loadConfig, verifyDependencies } from '../src/config';
import { verifyPiperEnvironment } from '../scripts/verify-piper';

describe('Contracts & Configuration', () => {
  it('should have standard vertical profiles defined with 9:16 aspect ratio', () => {
    const p1080 = VIDEO_PROFILES['vertical-1080'];
    assert.ok(p1080);
    assert.strictEqual(p1080.width, 1080);
    assert.strictEqual(p1080.height, 1920);
    assert.strictEqual(p1080.width / p1080.height, 9 / 16);

    const p720 = VIDEO_PROFILES['vertical-720'];
    assert.ok(p720);
    assert.strictEqual(p720.width, 720);
    assert.strictEqual(p720.height, 1280);
    assert.strictEqual(p720.width / p720.height, 9 / 16);

    const p540 = VIDEO_PROFILES['vertical-540'];
    assert.ok(p540);
    assert.strictEqual(p540.width, 540);
    assert.strictEqual(p540.height, 960);
    assert.strictEqual(p540.width / p540.height, 9 / 16);
  });

  it('should load default configuration without throwing', () => {
    const config = loadConfig();
    assert.ok(config);
    assert.ok(config.piperBin);
    assert.ok(config.piperModel);
    assert.ok(config.ffmpegBin);
    assert.ok(config.ffprobeBin);
  });

  it('should verify dependencies and report binary statuses', () => {
    const config = loadConfig();
    const result = verifyDependencies(config, false);
    assert.ok(result);
    assert.strictEqual(result.node.ok, true);
    assert.strictEqual(result.ffmpeg.ok, true);
    assert.strictEqual(result.ffprobe.ok, true);
  });

  it('should verify Piper runtime executable and voice model readiness', () => {
    const config = loadConfig();
    assert.ok(fs.existsSync(config.piperBin), `Piper binary not found at ${config.piperBin}`);
    
    // Verify executable
    const proc = spawnSync(config.piperBin, ['--version'], { stdio: 'pipe' });
    assert.strictEqual(proc.status, 0, `Piper binary failed to execute: ${proc.stderr?.toString()}`);

    // Verify model readability and non-empty size
    assert.ok(fs.existsSync(config.piperModel), `Voice model not found at ${config.piperModel}`);
    fs.accessSync(config.piperModel, fs.constants.R_OK);
    const stat = fs.statSync(config.piperModel);
    assert.ok(stat.size > 10 * 1024 * 1024, `Voice model size (${stat.size} bytes) is suspiciously small`);

    // Verify companion JSON
    const jsonPath = `${config.piperModel}.json`;
    assert.ok(fs.existsSync(jsonPath), `Companion voice model JSON not found at ${jsonPath}`);
  });

  it('should pass full pre-flight Piper environment verification and micro-synthesis', () => {
    const result = verifyPiperEnvironment();
    assert.strictEqual(result.ok, true, `Piper verification failed: ${result.error}`);
    assert.ok(result.piperVersion);
    assert.ok((result.testAudioDurationSec || 0) > 0);
  });
});
