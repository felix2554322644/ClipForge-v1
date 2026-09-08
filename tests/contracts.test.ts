import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VIDEO_PROFILES, loadConfig, verifyDependencies } from '../src/config';

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
});
