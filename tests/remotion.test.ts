import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RemotionSceneRenderer } from '../src/services/remotion/renderer';
import { RemotionCompositionService } from '../src/services/remotion/compositionService';
import { PipelineLogger } from '../src/services/logging/logger';

const logger = new PipelineLogger();

test('RemotionCompositionService: builds structured v2 overlay configurations', () => {
  const service = new RemotionCompositionService(logger);

  const hook = service.buildHookTypography('What If You Never Slept?', 'The 24-Hour Awakening');
  assert.strictEqual(hook.type, 'hook_typography');
  assert.strictEqual(hook.headline, 'What If You Never Slept?');
  assert.strictEqual(hook.subheadline, 'The 24-Hour Awakening');

  const twist = service.buildSignatureTwistReveal('THE IMPLICATION');
  assert.strictEqual(twist.type, 'signature_twist_reveal');
  assert.strictEqual(twist.label, 'THE IMPLICATION');

  const endCard = service.buildEndCard('Every night shapes tomorrow.', 'ClipForge');
  assert.strictEqual(endCard.type, 'end_card');
  assert.strictEqual(endCard.brandName, 'ClipForge');

  const captions = service.buildCaptions([
    { word: 'What', startSeconds: 0.1, endSeconds: 0.3 },
    { word: 'if', startSeconds: 0.3, endSeconds: 0.5 },
  ]);
  assert.strictEqual(captions.type, 'remotion_captions');
  assert.strictEqual(captions.words.length, 2);
});

test('RemotionSceneRenderer: Renders deterministic hook typography overlay to MP4', async () => {
  const renderer = new RemotionSceneRenderer(logger);
  const outPath = path.resolve(process.cwd(), 'artifacts', 'visuals', `test_overlay_${Date.now()}.mp4`);

  const result = await renderer.renderOverlay({
    type: 'hook_typography',
    durationSeconds: 2.0,
    fps: 30,
    outputPath: outPath,
    props: {
      headline: 'What If You Never Slept?',
      subheadline: 'The Ultimate Experiment',
    },
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.width, 1080);
  assert.strictEqual(result.height, 1920);
  assert.strictEqual(result.mimeType, 'video/mp4');
  assert.ok(fs.existsSync(outPath), 'Output MP4 must exist');
  assert.ok(fs.statSync(outPath).size > 0, 'Output MP4 must not be empty');
});
