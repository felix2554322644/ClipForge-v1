import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { MotionApplier } from '../src/services/media/motion';
import { FfmpegRenderer } from '../src/services/rendering/ffmpegRenderer';
import { FfprobeValidator } from '../src/services/validation/ffprobeValidator';
import { PipelineLogger } from '../src/services/logging/logger';
import { CONFIG } from '../src/config/index';
import { TimelineComposition } from '../src/types/pipeline';

const TEST_DIR = path.join(CONFIG.OUTPUT_DIR, 'test_motion_applier');

test.before(() => {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
});

test.after(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

test('Motion: Every motion type is valid, syntax-correct, and deterministic', () => {
  const motionTypes = [
    'push_in',
    'pull_out',
    'pan_left',
    'pan_right',
    'tilt_up',
    'tilt_down',
    'punch_in',
    'static',
    'zoom_in',
    'zoom_out',
  ];

  for (const motion of motionTypes) {
    const filter1 = MotionApplier.buildMotionFilter(motion, 2.5, 30, 1080, 1920);
    const filter2 = MotionApplier.buildMotionFilter(motion, 2.5, 30, 1080, 1920);

    // Deterministic check
    assert.strictEqual(
      filter1,
      filter2,
      `Motion filter for ${motion} should be completely deterministic`
    );

    // No legacy zoompan check
    assert.ok(
      !filter1.includes('zoompan'),
      `Motion filter for ${motion} must not use FFmpeg zoompan filter`
    );

    // No NaN or undefined in output filter string
    assert.ok(!filter1.includes('NaN'), `Motion filter for ${motion} contains NaN`);
    assert.ok(!filter1.includes('undefined'), `Motion filter for ${motion} contains undefined`);

    // Must lock output to 30 FPS and setsar=1
    assert.ok(
      filter1.includes('fps=30'),
      `Motion filter for ${motion} must explicitly enforce fps=30`
    );
    assert.ok(
      filter1.includes('setsar=1'),
      `Motion filter for ${motion} must enforce setsar=1`
    );
  }
});

test('Motion: Motion settings remain within safe intensity limits', () => {
  const intensities: Array<'subtle' | 'moderate' | 'dramatic'> = ['subtle', 'moderate', 'dramatic'];

  for (const intensity of intensities) {
    // push_in: subtle and professional, never exceeding 1.12x zoom
    const pushInParams = MotionApplier.getMotionParameters('push_in', 'standard', intensity);
    assert.ok(
      pushInParams.maxScale <= 1.10,
      `push_in max scale (${pushInParams.maxScale}) must not exceed safe limit 1.10`
    );
    assert.ok(
      pushInParams.maxScale > 1.02,
      `push_in max scale (${pushInParams.maxScale}) must provide perceptible motion`
    );
    assert.strictEqual(pushInParams.isAnimated, true);

    // pull_out: safe start scale
    const pullOutParams = MotionApplier.getMotionParameters('pull_out', 'standard', intensity);
    assert.ok(
      pullOutParams.maxScale <= 1.10,
      `pull_out max scale (${pullOutParams.maxScale}) must not exceed safe limit 1.10`
    );
    assert.ok(
      pullOutParams.startScale > pullOutParams.endScale,
      'pull_out start scale must exceed end scale'
    );
    assert.strictEqual(pullOutParams.isAnimated, true);

    // punch_in: emphatic crop but safe within 1.25x
    const punchParams = MotionApplier.getMotionParameters('punch_in', 'standard', intensity);
    assert.ok(
      punchParams.maxScale <= 1.25,
      `punch_in max scale (${punchParams.maxScale}) must not exceed safe limit 1.25`
    );
    assert.ok(
      punchParams.startScale >= 1.12,
      `punch_in start scale (${punchParams.startScale}) must provide emphatic tight framing`
    );

    // pan_left / pan_right: margin scale and travel distance
    const panParams = MotionApplier.getMotionParameters('pan_left', 'standard', intensity);
    assert.ok(
      panParams.maxScale <= 1.12,
      `pan margin scale (${panParams.maxScale}) must be subtle (<= 1.12)`
    );
    assert.ok(
      panParams.panPercent > 0.3 && panParams.panPercent <= 0.8,
      `pan travel percent (${panParams.panPercent}) must be between 30% and 80% of margin`
    );

    // tilt_up / tilt_down: margin scale and travel distance
    const tiltParams = MotionApplier.getMotionParameters('tilt_up', 'standard', intensity);
    assert.ok(
      tiltParams.maxScale <= 1.12,
      `tilt margin scale (${tiltParams.maxScale}) must be subtle (<= 1.12)`
    );
    assert.ok(
      tiltParams.tiltPercent > 0.3 && tiltParams.tiltPercent <= 0.8,
      `tilt travel percent (${tiltParams.tiltPercent}) must be between 30% and 80% of margin`
    );
  }
});

test('Motion: Static clips are genuinely stable without artificial shaking or animation', () => {
  const staticParams = MotionApplier.getMotionParameters('static', 'standard');
  assert.strictEqual(staticParams.isAnimated, false, 'static motion must not be animated');
  assert.strictEqual(staticParams.panPercent, 0, 'static motion must have 0 pan');
  assert.strictEqual(staticParams.tiltPercent, 0, 'static motion must have 0 tilt');
  assert.strictEqual(staticParams.startScale, 1.0, 'standard static scale must be 1.0');
  assert.strictEqual(staticParams.endScale, 1.0, 'standard static end scale must be 1.0');

  // Verify static filter contains NO time-varying expressions or frame variables
  const staticFilter = MotionApplier.buildMotionFilter('static', 3.0, 30, 1080, 1920);
  assert.ok(!staticFilter.includes('min(t'), 'static filter must not evaluate time variable t');
  assert.ok(!staticFilter.includes('eval=frame'), 'static filter must not evaluate dynamic frames');
  assert.ok(!staticFilter.includes('zoompan'), 'static filter must never use zoompan');
  assert.ok(
    staticFilter.includes('crop=1080:1920:(in_w-out_w)/2:(in_h-out_h)/2'),
    'static filter must use centered stationary crop'
  );
});

test('Motion: Target FPS is consistently 30 FPS across different source framerates', () => {
  const logger = new PipelineLogger(TEST_DIR);
  const validator = new FfprobeValidator(logger);

  // Generate test inputs with different frame rates: 24 FPS and 25 FPS
  const src24fps = path.join(TEST_DIR, 'source_24fps.mp4');
  const src25fps = path.join(TEST_DIR, 'source_25fps.mp4');

  execSync(
    `ffmpeg -y -f lavfi -i "testsrc2=size=1920x1080:rate=24:duration=2" -c:v libx264 -preset ultrafast "${src24fps}"`,
    { stdio: 'pipe' }
  );
  execSync(
    `ffmpeg -y -f lavfi -i "testsrc2=size=1080x1920:rate=25:duration=2" -c:v libx264 -preset ultrafast "${src25fps}"`,
    { stdio: 'pipe' }
  );

  // Apply various motions
  const outPush = path.join(TEST_DIR, 'out_push.mp4');
  const outPan = path.join(TEST_DIR, 'out_pan.mp4');
  const outStatic = path.join(TEST_DIR, 'out_static.mp4');

  MotionApplier.applyMotion(src24fps, outPush, 'push_in', 1.5, 30);
  MotionApplier.applyMotion(src25fps, outPan, 'pan_left', 1.5, 30);
  MotionApplier.applyMotion(src25fps, outStatic, 'static', 1.5, 30);

  // Probe outputs to verify target FPS is always 30
  for (const outPath of [outPush, outPan, outStatic]) {
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,avg_frame_rate,nb_frames -of json "${outPath}"`;
    const probeData = JSON.parse(execSync(probeCmd, { encoding: 'utf-8' }));
    const stream = probeData.streams[0];

    assert.strictEqual(stream.width, 1080, 'Output width must be 1080');
    assert.strictEqual(stream.height, 1920, 'Output height must be 1920');
    assert.strictEqual(stream.r_frame_rate, '30/1', 'r_frame_rate must be exactly 30/1');
    assert.strictEqual(stream.avg_frame_rate, '30/1', 'avg_frame_rate must be exactly 30/1');
    assert.strictEqual(Number(stream.nb_frames), 45, '1.5s at 30fps must produce exactly 45 frames');

    const validation = validator.validate(outPath, 1.5);
    assert.ok(validation.checks.validResolution, 'Resolution must pass validation');
    assert.ok(validation.checks.validFramerate, 'Framerate must pass 30 FPS validation');
  }
});

test('Motion: Final render configuration consistently produces 30 FPS with mixed origin cuts', async () => {
  const logger = new PipelineLogger(TEST_DIR);
  const renderer = new FfmpegRenderer(logger);
  const validator = new FfprobeValidator(logger);

  // 1. Generate audio track (3 seconds)
  const audioTrack = path.join(TEST_DIR, 'test_audio.wav');
  execSync(
    `ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3" -c:a pcm_s16le "${audioTrack}"`,
    { stdio: 'pipe' }
  );

  // 2. Generate sources with mixed frame rates (24fps and 25fps)
  const srcA = path.join(TEST_DIR, 'cut_src_a.mp4');
  const srcB = path.join(TEST_DIR, 'cut_src_b.mp4');
  execSync(
    `ffmpeg -y -f lavfi -i "testsrc2=size=1920x1080:rate=24:duration=3" -c:v libx264 -preset ultrafast "${srcA}"`,
    { stdio: 'pipe' }
  );
  execSync(
    `ffmpeg -y -f lavfi -i "testsrc2=size=1080x1920:rate=25:duration=3" -c:v libx264 -preset ultrafast "${srcB}"`,
    { stdio: 'pipe' }
  );

  // 3. Assemble timeline with mixed motions
  const timeline: TimelineComposition = {
    width: 1080,
    height: 1920,
    fps: 30,
    totalDurationSeconds: 3.0,
    audioTrackPath: audioTrack,
    cuts: [
      {
        shotId: 'shot_1',
        sceneIndex: 0,
        shotIndex: 0,
        videoSourcePath: srcA,
        inPoint: 0.2,
        outPoint: 1.7,
        durationSeconds: 1.5,
        motionEffect: 'push_in',
        transition: 'cut',
        captionText: 'Shot 1 with push in motion',
      },
      {
        shotId: 'shot_2',
        sceneIndex: 1,
        shotIndex: 0,
        videoSourcePath: srcB,
        inPoint: 0.0,
        outPoint: 1.5,
        durationSeconds: 1.5,
        motionEffect: 'static',
        transition: 'fade',
        captionText: 'Shot 2 with static framing',
      },
    ],
  };

  const finalVideo = path.join(TEST_DIR, 'final_composite_30fps.mp4');
  const report = await renderer.render(timeline, finalVideo);

  assert.ok(fs.existsSync(finalVideo), 'Final video must be generated');
  assert.ok(report.fileSizeBytes > 50000, 'File size must be valid');

  // Verify final video stream metadata
  const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,avg_frame_rate,nb_frames -of json "${finalVideo}"`;
  const probeData = JSON.parse(execSync(probeCmd, { encoding: 'utf-8' }));
  const stream = probeData.streams[0];

  assert.strictEqual(stream.width, 1080, 'Final video width must be 1080');
  assert.strictEqual(stream.height, 1920, 'Final video height must be 1920');
  assert.strictEqual(stream.r_frame_rate, '30/1', 'Final video r_frame_rate must be 30/1');
  assert.strictEqual(stream.avg_frame_rate, '30/1', 'Final video avg_frame_rate must be 30/1');
  assert.ok(
    Number(stream.nb_frames) >= 88 && Number(stream.nb_frames) <= 92,
    `3s composite at 30fps must have ~90 frames, got ${stream.nb_frames}`
  );

  const validation = validator.validate(finalVideo, 3.0);
  assert.ok(validation.isValid, `Final video must pass validation: ${validation.errors.join(', ')}`);
  assert.ok(validation.checks.validFramerate, 'Final composite must have valid 30 FPS');
  assert.ok(validation.checks.validResolution, 'Final composite must be 1080x1920');
});
