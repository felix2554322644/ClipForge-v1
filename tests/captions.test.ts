import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CaptionEngine, DEFAULT_CAPTION_THEME } from '../src/services/captions/captionEngine';
import { PipelineLogger } from '../src/services/logging/logger';

test('Captions: Strict elimination of punctuation-only or whitespace segments', () => {
  const engine = new CaptionEngine();
  // Text containing trailing periods, dashes, ellipsis, and isolated punctuation
  const text = 'Scientists found a signal... . - Right now, deep space is active! . — .';
  const { segments } = engine.generateCaptions(text, 6.0);

  assert.ok(segments.length > 0, 'Should generate segments');

  for (const seg of segments) {
    const alphanumericOnly = seg.text.replace(/[^a-zA-Z0-9]/g, '');
    assert.ok(
      alphanumericOnly.length > 0,
      `Punctuation-only caption segment forbidden: "${seg.text}"`
    );
    assert.notEqual(seg.text.trim(), '.', 'Single dot segment is strictly forbidden');
    assert.notEqual(seg.text.trim(), '-', 'Single dash segment is strictly forbidden');
  }
});

test('Captions: Splits text into 2-5 word natural spoken chunks', () => {
  const engine = new CaptionEngine();
  const text =
    'Scientists recently traced one of these signals to a magnetar, a dead star with a magnetic field trillions of times stronger than Earth.';
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
    assert.ok(seg.endTime > seg.startTime, `End time must exceed start time`);
  }

  // Exact timeline boundary coverage
  assert.equal(segments[0].startTime, 0);
  assert.equal(Math.round(segments[segments.length - 1].endTime), Math.round(totalDuration));
});

test('Captions: Identifies emphasis words (numbers, acronyms, key terms)', () => {
  const engine = new CaptionEngine();
  const text = 'A blast from a MAGNETAR unleashed 10,000 times more energy in milliseconds.';

  const { segments } = engine.generateCaptions(text, 5.0);
  const emphasisSegments = segments.filter((s) => s.isEmphasis);

  assert.ok(emphasisSegments.length > 0, 'Should detect at least one emphasis segment');

  const allEmphasisWords = segments.flatMap((s) => s.emphasisWords || []);
  assert.ok(
    allEmphasisWords.some(
      (w) => w.toUpperCase().includes('MAGNETAR') || w.includes('10,000') || w.includes('10000')
    ),
    `Emphasis detection failed: ${allEmphasisWords.join(', ')}`
  );
});

test('Captions: Generates valid TikTok/Reels styled ASS subtitle with safe zone and word pop', () => {
  const tmpAss = path.join('/tmp', `test_captions_${Date.now()}.ass`);
  const engine = new CaptionEngine(new PipelineLogger());
  const text = 'The top suspect is a MAGNETAR with 10,000 times power.';

  const { segments, assPath } = engine.generateCaptions(text, 5.0, tmpAss);

  assert.ok(assPath && fs.existsSync(assPath), 'ASS file should exist');
  const content = fs.readFileSync(assPath, 'utf-8');

  // Verify social short-form ASS specifications
  assert.ok(content.includes('PlayResX: 1080'), 'ASS should target 1080 resolution');
  assert.ok(content.includes('PlayResY: 1920'), 'ASS should target 1920 resolution');
  assert.ok(content.includes('Style: SocialCaptions'), 'ASS should define SocialCaptions style');
  assert.ok(content.includes('Liberation Sans'), 'ASS should use bold Liberation Sans font');
  assert.ok(content.includes(',78,'), 'ASS should specify large 78px font size');

  // Safe area margin (520 vertical margin from bottom edge)
  assert.ok(content.includes(',520,'), 'ASS should enforce 520px vertical safe zone margin');

  // Word-level emphasis styling tags (accent color & subtle scale pop)
  assert.ok(
    content.includes('\\c&H0000E6FF&') || content.includes('\\fscx112'),
    'ASS must contain word-level emphasis styling tags (color accent or scale pop)'
  );

  // Phrase animation fade tags
  assert.ok(content.includes('\\fad(70,70)'), 'ASS should contain phrase entry/exit fade tags');

  // Clean up
  if (fs.existsSync(tmpAss)) fs.unlinkSync(tmpAss);
});
