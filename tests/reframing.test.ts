import test from 'node:test';
import assert from 'node:assert';
import { EditingPrimitives } from '../src/server/services/EditingPrimitives.js';

test('EditingPrimitives correctly reframes landscape 16:9 to vertical 9:16', () => {
  // 1920x1080 -> 1080x1920
  const reframing = EditingPrimitives.computeVerticalReframing(1920, 1080, 1080, 1920);

  // Height scaled to 1920, width scaled proportionally to 3414 (even)
  assert.strictEqual(reframing.scaleHeight, 1920);
  assert.strictEqual(reframing.cropY, 0);
  assert.ok(reframing.cropX > 0, 'Excess width must be cropped from center');
  assert.ok(reframing.filterString.includes('scale=1080:1920:force_original_aspect_ratio=increase'));
  assert.ok(reframing.filterString.includes('crop=1080:1920'));
});

test('EditingPrimitives handles native vertical 9:16 without distortion', () => {
  const reframing = EditingPrimitives.computeVerticalReframing(1080, 1920, 1080, 1920);
  assert.strictEqual(reframing.scaleWidth, 1080);
  assert.strictEqual(reframing.scaleHeight, 1920);
  assert.strictEqual(reframing.cropX, 0);
  assert.strictEqual(reframing.cropY, 0);
});

test('EditingPrimitives produces valid zoom filter expressions', () => {
  const zoomIn = EditingPrimitives.buildZoomFilter('slow_zoom_in', 1080, 1920, 3.0, 30);
  assert.ok(zoomIn.includes('1+0.08*n/'));

  const zoomOut = EditingPrimitives.buildZoomFilter('slow_zoom_out', 1080, 1920, 3.0, 30);
  assert.ok(zoomOut.includes('1.08-0.08*n/'));

  const staticFilter = EditingPrimitives.buildZoomFilter('static', 1080, 1920, 3.0, 30);
  assert.ok(!staticFilter.includes('eval=frame'));
});
