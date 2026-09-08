import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ReframingService } from '../src/services/media/reframing';

describe('9:16 Reframing Calculations', () => {
  const reframer = new ReframingService();

  it('should crop 16:9 landscape (1920x1080) to exact 9:16 vertical without distortion', () => {
    const result = reframer.calculateReframing(1920, 1080, 1080, 1920, 'center');

    // Expected crop width = 1080 * (9/16) = 607.5 -> 606 or 608 (even number)
    assert.strictEqual(result.cropHeight, 1080);
    assert.strictEqual(result.cropWidth % 2, 0);
    assert.ok(result.cropWidth >= 606 && result.cropWidth <= 608);

    // Centered crop X offset
    const expectedX = Math.round((1920 - result.cropWidth) / 2);
    assert.strictEqual(result.cropX, expectedX % 2 === 0 ? expectedX : expectedX - 1);
    assert.strictEqual(result.cropY, 0);
    assert.strictEqual(result.targetWidth, 1080);
    assert.strictEqual(result.targetHeight, 1920);
  });

  it('should handle native portrait 1080x1920 with full frame usage', () => {
    const result = reframer.calculateReframing(1080, 1920, 1080, 1920, 'center');

    assert.strictEqual(result.cropWidth, 1080);
    assert.strictEqual(result.cropHeight, 1920);
    assert.strictEqual(result.cropX, 0);
    assert.strictEqual(result.cropY, 0);
    assert.strictEqual(result.scaleFactor, 1.0);
  });

  it('should support directional anchors: focus_left and focus_right', () => {
    const left = reframer.calculateReframing(1920, 1080, 1080, 1920, 'focus_left');
    const right = reframer.calculateReframing(1920, 1080, 1080, 1920, 'focus_right');

    assert.ok(left.cropX < right.cropX, 'Left anchor cropX should be less than right anchor cropX');
  });

  it('should produce a valid FFmpeg filter string', () => {
    const result = reframer.calculateReframing(1920, 1080, 1080, 1920, 'center');
    assert.ok(result.filterString.startsWith('crop='));
    assert.ok(result.filterString.includes('scale=1080:1920'));
  });
});
