import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { NarrationPreprocessor } from '../src/services/narration/textPreprocessor';
import { AudioProcessor } from '../src/services/narration/audioProcessor';
import { PiperNarrationEngine } from '../src/services/narration/piper';
import { AudioMeasurer } from '../src/services/narration/audioMeasurer';
import { PipelineLogger } from '../src/services/logging/logger';
import { CONFIG } from '../src/config/index';

const TEST_OUT_DIR = path.resolve(process.cwd(), 'artifacts/test_narration');

test('Narration Suite: Deterministic text preprocessing', async (t) => {
  await t.test('Expands ordinals, decimals, and comma-separated numbers', () => {
    const raw = 'The 1st satellite in the 21st century measured 3.14 units, weighing over 10,000 kg.';
    const normalized = NarrationPreprocessor.normalizeText(raw);
    assert.match(normalized, /first satellite/);
    assert.match(normalized, /twenty-first century/);
    assert.match(normalized, /3 point 14/);
    assert.match(normalized, /10000 kilograms/);
  });

  await t.test('Expands currencies, percentages, and multipliers', () => {
    const raw = 'The project cost $10B, with a $50M bonus and $100K buffer. Efficiency reached 99.9% at 10x speed.';
    const normalized = NarrationPreprocessor.normalizeText(raw);
    assert.match(normalized, /10 billion dollars/);
    assert.match(normalized, /50 million dollars/);
    assert.match(normalized, /100 thousand dollars/);
    assert.match(normalized, /99 point 9 percent/);
    assert.match(normalized, /10 times/);
  });

  await t.test('Expands symbols, temperatures, and units', () => {
    const raw = 'Temp dropped to -40°C (-40°F) at 100 km/h with 5 + 5 = 10 & ~50 m/s.';
    const normalized = NarrationPreprocessor.normalizeText(raw);
    assert.match(normalized, /minus 40 degrees Celsius/);
    assert.match(normalized, /minus 40 degrees Fahrenheit/);
    assert.match(normalized, /100 kilometers per hour/);
    assert.match(normalized, /plus/);
    assert.match(normalized, /equals/);
    assert.match(normalized, /and/);
    assert.match(normalized, /approximately 50 meters per second/);
  });

  await t.test('Expands common abbreviations and technical acronyms', () => {
    const raw = 'Dr. Smith studied AI, DNA, and the JWST vs. traditional methods (approx. 50 km).';
    const normalized = NarrationPreprocessor.normalizeText(raw);
    assert.match(normalized, /Doctor Smith/);
    assert.match(normalized, /A\.I\./);
    assert.match(normalized, /D\.N\.A\./);
    assert.match(normalized, /J\.W\.S\.T\./);
    assert.match(normalized, /versus traditional methods/);
    assert.match(normalized, /approximately 50 kilometers/);
  });

  await t.test('Cleans markdown formatting and unicode quotes', () => {
    const raw = '“Look at this **massive** galaxy,” said Dr. Adams—`code` was verified.';
    const normalized = NarrationPreprocessor.normalizeText(raw);
    assert.doesNotMatch(normalized, /[*`“”]/);
    assert.match(normalized, /massive galaxy/);
    assert.match(normalized, /Doctor Adams/);
  });
});

test('Narration Suite: Pause handling and scene joining', async (t) => {
  await t.test('Replaces ellipses with natural punctuation pauses', () => {
    const sentenceBoundary = 'Deep space signals hit Earth... What is creating them?';
    const normalizedBoundary = NarrationPreprocessor.normalizeText(sentenceBoundary);
    assert.equal(normalizedBoundary, 'Deep space signals hit Earth. What is creating them?');

    const midPhrase = 'Wait for it... it is happening right now.';
    const normalizedMid = NarrationPreprocessor.normalizeText(midPhrase);
    assert.equal(normalizedMid, 'Wait for it, it is happening right now.');
  });

  await t.test('Joins scene narrations into a continuous cohesive delivery without artificial gaps', () => {
    const scenes = [
      { narration: 'Deep space signals hit Earth from billions of light years away' },
      { narration: 'Astronomers detected over one thousand pulses in a single week!' },
      { narration: 'Could this be proof of something far greater?' },
    ];
    const combined = NarrationPreprocessor.joinSceneNarrations(scenes);
    assert.doesNotMatch(combined, /\.\.\./);
    assert.equal(
      combined,
      'Deep space signals hit Earth from billions of light years away. Astronomers detected over one thousand pulses in a single week! Could this be proof of something far greater?'
    );
  });
});

test('Narration Suite: Silence trimming and deterministic audio processing', async (t) => {
  if (!fs.existsSync(TEST_OUT_DIR)) {
    fs.mkdirSync(TEST_OUT_DIR, { recursive: true });
  }

  const paddedInput = path.join(TEST_OUT_DIR, 'padded_test.wav');
  const processedOutput = path.join(TEST_OUT_DIR, 'processed_test.wav');

  // Synthesize an artificial audio file with 0.5s leading silence + 1.0s sine wave + 0.5s trailing silence (total: 2.0s)
  execSync(
    `ffmpeg -y -f lavfi -i "anullsrc=duration=0.5" -f lavfi -i "sine=frequency=440:duration=1.0" -f lavfi -i "anullsrc=duration=0.5" -filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]" -map "[out]" -ar 22050 -ac 1 -c:a pcm_s16le "${paddedInput}"`,
    { stdio: 'pipe' }
  );

  const rawProbe = AudioMeasurer.probe(paddedInput);
  assert.ok(
    Math.abs(rawProbe.durationSeconds - 2.0) < 0.05,
    `Raw padded audio should be ~2.0s, got ${rawProbe.durationSeconds}s`
  );

  const logger = new PipelineLogger(TEST_OUT_DIR);
  const finalProbe = AudioProcessor.processNarrationAudio(paddedInput, processedOutput, logger);

  await t.test('Trims accidental leading and trailing silence', () => {
    // Should remove ~1.0s of silence, leaving ~1.0s of active signal
    assert.ok(
      finalProbe.durationSeconds < 1.15,
      `Processed duration should be ~1.0s, got ${finalProbe.durationSeconds}s`
    );
    assert.ok(
      finalProbe.durationSeconds > 0.9,
      `Active signal must be preserved, got ${finalProbe.durationSeconds}s`
    );
  });

  await t.test('Normalizes sample rate and format to standard 44.1kHz mono PCM', () => {
    assert.equal(finalProbe.sampleRate, 44100);
    assert.equal(finalProbe.channels, 1);
    assert.equal(finalProbe.format, 'wav');
  });
});

test('Narration Suite: Piper TTS end-to-end synthesis and duration accuracy', async (t) => {
  if (!fs.existsSync(TEST_OUT_DIR)) {
    fs.mkdirSync(TEST_OUT_DIR, { recursive: true });
  }

  const logger = new PipelineLogger(TEST_OUT_DIR);
  const narrationEngine = new PiperNarrationEngine(logger);
  const speechOutput = path.join(TEST_OUT_DIR, 'piper_test.wav');

  const scriptText =
    'The 1st James Webb Space Telescope discovery cost $10B and operates at -200°C. With 99% accuracy, AI models detected new galaxies.';

  const artifact = await narrationEngine.synthesizeSpeech(scriptText, speechOutput);

  await t.test('Returns verified NarrationAudioArtifact', () => {
    assert.equal(artifact.audioPath, speechOutput);
    assert.ok(artifact.durationSeconds > 2.0, `Audio duration should be >2.0s, got ${artifact.durationSeconds}s`);
    assert.equal(artifact.sampleRate, 44100);
    assert.equal(artifact.channels, 1);
    assert.equal(artifact.format, 'wav');
  });

  await t.test('Actual generated file duration matches artifact durationSeconds accurately', () => {
    const fileProbe = AudioMeasurer.probe(speechOutput);
    const diff = Math.abs(fileProbe.durationSeconds - artifact.durationSeconds);
    assert.ok(
      diff < 0.001,
      `File probed duration (${fileProbe.durationSeconds}) must match artifact duration (${artifact.durationSeconds})`
    );
  });

  await t.test('Audio output is non-empty and has appropriate file size', () => {
    const stats = fs.statSync(speechOutput);
    assert.ok(stats.size > 20000, `Audio file should be non-empty and sizable, got ${stats.size} bytes`);
  });
});
