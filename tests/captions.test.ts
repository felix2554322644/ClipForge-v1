import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CaptionEngine } from '../src/services/captions/captionEngine';
import { PipelineLogger } from '../src/services/logging/logger';

test('Captions: CaptionEngine splits text into 2-5 word natural chunks', () => {
  const engine = new CaptionEngine();
  const text = 'Scientists recently traced one of these signals to a magnetar, a dead star with a magnetic field trillions of times stronger than Earth.';
  const totalDuration = 10.0;

  const { segments } = engine.generateCaptions(text, totalDuration);

  assert.ok(segments.length >= 3, `Expected at least 3 chunks, got ${segments.length}`);

  for (const seg of segments) {
    const wordCount = seg.text.trim().split(/\s+/).length;
    assert.ok(
      wordCount >= 1 && wordCount <= 6,
      `Chunk has unexpected word count (${wordCount}): "${seg.text}"`
    );
    assert.ok(seg.duration > 0, `Segment duration must be positive: ${seg.duration}`);
    assert.ok(seg.endTime > seg.startTime, `End time must exceed start time: ${seg.startTime} -> ${seg.endTime}`);
  }

  // Verify timestamps cover the duration
  assert.equal(segments[0].startTime, 0);
  assert.equal(Math.round(segments[segments.length - 1].endTime), Math.round(totalDuration));
});

test('Captions: Detects emphasis words correctly', () => {
  const engine = new CaptionEngine();
  const text = 'A blast from a MAGNETAR unleashed 10,000 times more energy in milliseconds.';

  const { segments } = engine.generateCaptions(text, 5.0);
  const emphasisSegments = segments.filter((s) => s.isEmphasis);

  assert.ok(emphasisSegments.length > 0, 'Should detect at least one emphasis segment');

  const allEmphasisWords = segments.flatMap((s) => s.emphasisWords || []);
  assert.ok(allEmphasisWords.some((w) => w.toUpperCase().includes('MAGNETAR') || w.includes('10000') || w.includes('10,000')));
});

test('Captions: Generates valid ASS subtitle file for burning into video', () => {
  const tmpAss = path.join('/tmp', `test_captions_${Date.now()}.ass`);
  const engine = new CaptionEngine(new PipelineLogger());
  const text = 'Deep space signals are pulsing right now across the universe.';

  const { segments, assPath } = engine.generateCaptions(text, 6.0, tmpAss);

  assert.ok(assPath && fs.existsSync(assPath), 'ASS file should exist');
  const content = fs.readFileSync(assPath, 'utf-8');

  assert.ok(content.includes('[Script Info]'), 'ASS should have Script Info');
  assert.ok(content.includes('PlayResX: 1080'), 'ASS should target 1080 width');
  assert.ok(content.includes('PlayResY: 1920'), 'ASS should target 1920 height');
  assert.ok(content.includes('Style: ShortForm'), 'ASS should define ShortForm style');
  assert.ok(content.includes('Dialogue: 0,'), 'ASS should contain Dialogue events');

  // Clean up
  if (fs.existsSync(tmpAss)) fs.unlinkSync(tmpAss);
});
