import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { VisualSceneValidator } from '../validator';
import { generateSceneHtml } from '../templates';
import { PlaywrightSceneRenderer } from '../renderer';
import { CustomSceneParams, CustomSceneType } from '../types';
import { PipelineLogger } from '../../logging/logger';

const logger = new PipelineLogger();

const SAMPLE_SCENES: Record<CustomSceneType, CustomSceneParams> = {
  kinetic_typography: {
    type: 'kinetic_typography',
    headline: 'The Speed of Light is Constant',
    emphasisWord: 'Constant',
    subtitle: 'Cosmic physics principle',
  },
  statistic_card: {
    type: 'statistic_card',
    statValue: '99.9%',
    statLabel: 'Accuracy Rate',
    contextNote: 'Measured across 10,000 runs',
  },
  timeline: {
    type: 'timeline',
    title: 'Mission Milestones',
    events: [
      { yearOrTime: '2020', label: 'Launch', description: 'Initial orbit insertion', active: false },
      { yearOrTime: '2024', label: 'Upgrade', description: 'Quantum telemetry integration', active: true },
    ],
  },
  comparison: {
    type: 'comparison',
    title: 'Architecture Comparison',
    leftLabel: 'Legacy Monolith',
    leftText: 'Slow cold starts and monolithic bottlenecks.',
    rightLabel: 'ClipForge Engine',
    rightText: 'Instant microservice orchestration and deterministic pipelines.',
    versusText: 'VS',
  },
  diagram_flow: {
    type: 'diagram_flow',
    title: 'Pipeline Flow',
    nodes: [
      { id: '1', label: 'Script Generation', sublabel: 'Gemini AI', status: 'active' },
      { id: '2', label: 'Visual Grounding', sublabel: 'Multimodal Frame Check', status: 'highlight' },
    ],
  },
  behavioral_psychology: {
    type: 'behavioral_psychology',
    principleName: 'Variable Reward Schedule',
    keyTakeaway: 'Dopamine spikes when the payout timing is unpredictable.',
    metricBarPercent: 85,
  },
  ui_simulation: {
    type: 'ui_simulation',
    appName: 'Terminal v1.0',
    windowTitle: 'clipforge_render.sh',
    actionCodeOrOutput: 'Initializing render pipeline...\n[OK] 1080x1920 vertical format locked.\n[OK] FFmpeg muxing complete.',
  },
  visual_metaphor: {
    type: 'visual_metaphor',
    metaphorTitle: 'The Iceberg of Debt',
    metaphorDescription: 'Technical debt lurks beneath the surface where simple metrics cannot see.',
    scaleFactor: '80% Hidden',
  },
  branded_transition: {
    type: 'branded_transition',
    brandName: 'ClipForge',
    sectionTitle: 'Act II: The Breakthrough',
  },
};

test('VisualSceneValidator validates all 9 initial scene types successfully', () => {
  for (const [sceneType, params] of Object.entries(SAMPLE_SCENES)) {
    const result = VisualSceneValidator.validateSceneParams(params);
    assert.strictEqual(result.valid, true, `Scene type ${sceneType} should be valid`);
  }
});

test('VisualSceneValidator rejects invalid or malformed scene parameters', () => {
  // Missing type
  const res1 = VisualSceneValidator.validateSceneParams({ headline: 'Test' });
  assert.strictEqual(res1.valid, false);

  // Unknown type
  const res2 = VisualSceneValidator.validateSceneParams({ type: 'unknown_scene', headline: 'Test' });
  assert.strictEqual(res2.valid, false);

  // Missing required field for statistic_card
  const res3 = VisualSceneValidator.validateSceneParams({ type: 'statistic_card', statValue: '100' });
  assert.strictEqual(res3.valid, false);

  // Missing required field for timeline
  const res4 = VisualSceneValidator.validateSceneParams({ type: 'timeline', events: [] });
  assert.strictEqual(res4.valid, false);
});

test('generateSceneHtml produces valid HTML with 9:16 and 16:9 format handling', () => {
  const params = SAMPLE_SCENES.kinetic_typography;

  const htmlVertical = generateSceneHtml({
    sceneParams: params,
    format: 'short',
    durationSeconds: 3.0,
  });
  assert.ok(htmlVertical.includes('1080px'), 'Vertical format should specify 1080px width');
  assert.ok(htmlVertical.includes('The Speed of Light'), 'Should include headline text');

  const htmlLandscape = generateSceneHtml({
    sceneParams: params,
    format: 'long',
    durationSeconds: 3.0,
  });
  assert.ok(htmlLandscape.includes('1920px'), 'Landscape format should specify 1920px width');
});

test('PlaywrightSceneRenderer renders scene deterministically or falls back safely', async () => {
  const renderer = new PlaywrightSceneRenderer(logger);
  const params = SAMPLE_SCENES.statistic_card;

  const result = await renderer.renderScene({
    sceneParams: params,
    format: 'short',
    durationSeconds: 3.5,
  });

  assert.strictEqual(result.success, true);
  assert.ok(result.filePath, 'Should return a valid output file path');
  assert.strictEqual(result.durationSeconds, 3.5);
  assert.ok(fs.existsSync(result.filePath), 'Rendered file should exist on disk');
});
