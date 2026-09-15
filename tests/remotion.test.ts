import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RemotionSceneRenderer } from '../src/services/remotion/renderer';
import { RemotionCompositionService } from '../src/services/remotion/compositionService';
import { PipelineLogger } from '../src/services/logging/logger';

const logger = new PipelineLogger();

test('RemotionCompositionService: builds structured scene configurations', () => {
  const service = new RemotionCompositionService(logger);

  const typo = service.buildKineticTypography('Quantum Advantage Verified', 'Advantage', 'Computational breakthrough');
  assert.strictEqual(typo.type, 'kinetic_typography');
  assert.strictEqual(typo.headline, 'Quantum Advantage Verified');
  assert.strictEqual(typo.emphasisWord, 'Advantage');

  const stat = service.buildStatisticCard('10x', 'Throughput Boost', 'Across distributed runners', 'up');
  assert.strictEqual(stat.type, 'statistic_card');
  assert.strictEqual(stat.statValue, '10x');
  assert.strictEqual(stat.trend, 'up');

  const comp = service.buildComparison('Architecture', 'Legacy', 'Slow polling', 'Modern', 'Event driven');
  assert.strictEqual(comp.type, 'comparison');
  assert.strictEqual(comp.leftLabel, 'Legacy');
  assert.strictEqual(comp.rightLabel, 'Modern');

  const diagram = service.buildDiagramFlow('Data Flow', [
    { id: '1', label: 'Ingest', sublabel: 'Fast parser' },
    { id: '2', label: 'Transform', sublabel: 'Zero copy' },
  ]);
  assert.strictEqual(diagram.type, 'diagram_flow');
  assert.strictEqual(diagram.nodes?.length, 2);
});

test('RemotionSceneRenderer: Renders deterministic kinetic typography to MP4', async () => {
  const renderer = new RemotionSceneRenderer(logger);
  const outPath = path.resolve(process.cwd(), 'artifacts', 'visuals', `test_remotion_${Date.now()}.mp4`);

  const result = await renderer.renderScene({
    sceneParams: {
      type: 'kinetic_typography',
      headline: 'Deterministic Rendering Engine',
      emphasisWord: 'Deterministic',
      subtitle: 'Native Remotion Composition Pipeline',
    },
    format: 'short',
    durationSeconds: 2.0,
    fps: 30,
    outputPath: outPath,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.width, 1080);
  assert.strictEqual(result.height, 1920);
  assert.strictEqual(result.mimeType, 'video/mp4');
  assert.ok(fs.existsSync(outPath), 'Output MP4 must exist');
  assert.ok(fs.statSync(outPath).size > 0, 'Output MP4 must not be empty');
});
