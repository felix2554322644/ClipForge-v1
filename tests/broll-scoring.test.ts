import test from 'node:test';
import assert from 'node:assert';
import { BrollSelector } from '../src/server/services/BrollSelector.js';
import { BrollCandidate, PlannedScene } from '../src/types/pipeline.js';

test('BrollSelector prioritizes matching vertical, high-resolution clips', () => {
  const selector = new BrollSelector();
  const scene: PlannedScene = {
    sceneId: 'scene_1',
    narrationText: 'A supermassive black hole tears apart a star.',
    estimatedDurationSec: 3.5,
    visualObjective: 'Stellar destruction black hole galaxy',
    visualDescription: 'Cosmic void',
    searchQueries: ['black hole', 'galaxy space'],
    preferredBrollType: 'cinematic',
    importance: 'high',
    editingGuidance: { cameraMotion: 'slow_zoom_in', cutPacing: 'moderate', transition: 'cut' },
  };

  const highQualityVerticalCandidate: BrollCandidate = {
    id: 'clip_hq_vertical',
    provider: 'pexels',
    title: 'black hole space galaxy cosmic',
    sourceUrl: 'https://example.com/1',
    downloadUrl: 'https://example.com/1.mp4',
    width: 1080,
    height: 1920,
    durationSec: 6.0,
    aspectRatio: 1080 / 1920, // 0.5625 (exact 9:16)
    tags: ['black hole', 'galaxy', 'space'],
  };

  const lowQualityLandscapeCandidate: BrollCandidate = {
    id: 'clip_lq_landscape',
    provider: 'pexels',
    title: 'random garden flowers',
    sourceUrl: 'https://example.com/2',
    downloadUrl: 'https://example.com/2.mp4',
    width: 640,
    height: 360,
    durationSec: 2.0,
    aspectRatio: 640 / 360,
    tags: ['flowers', 'park'],
  };

  const evalHq = selector.evaluateCandidate(highQualityVerticalCandidate, scene, 'black hole space');
  const evalLq = selector.evaluateCandidate(lowQualityLandscapeCandidate, scene, 'black hole space');

  assert.ok(evalHq.score > evalLq.score, 'High quality vertical candidate should outscore low quality irrelevant clip');
  assert.ok(evalHq.score >= 70, `HQ vertical candidate should achieve a high score (got ${evalHq.score})`);
  assert.strictEqual(evalHq.scoreBreakdown.aspectRatioSuitability, 25, 'Exact 9:16 should score max aspect ratio points');

  const selected = selector.selectBestCandidate([lowQualityLandscapeCandidate, highQualityVerticalCandidate], scene, 'black hole space');
  assert.strictEqual(selected.candidate.id, 'clip_hq_vertical');
});
