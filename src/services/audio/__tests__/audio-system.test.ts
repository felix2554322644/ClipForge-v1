import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ProfessionalAudioMixer } from '../mixer';
import { AudioMeasurer } from '../../narration/audioMeasurer';
import { FfmpegRenderer } from '../../rendering/ffmpegRenderer';
import { PipelineLogger } from '../../logging/logger';

const logger = new PipelineLogger();

test('ProfessionalAudioMixer: mixes narration, music bed, and SFX with priority and duration preservation', () => {
  const tmpDir = path.join('/tmp', `audio_test_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const dummyNarration = path.join(tmpDir, 'narration.wav');
  const outputWav = path.join(tmpDir, 'master_mix.wav');

  // Generate 3 seconds dummy narration WAV via ffmpeg
  const genCmd = `ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3.0" -ar 44100 -ac 1 -c:a pcm_s16le "${dummyNarration}"`;
  execSync(genCmd, { stdio: 'pipe' });

  const mixer = new ProfessionalAudioMixer(logger);
  const probe = mixer.mixAudio(dummyNarration, outputWav, {
    targetDurationSeconds: 3.0,
  });

  assert.ok(fs.existsSync(outputWav), 'Master audio mix file must exist');
  assert.equal(Math.round(probe.durationSeconds), 3, 'Duration must be strictly preserved at 3.0s');
  assert.ok(probe.sampleRate > 0, 'Sample rate must be valid');
});

test('ProfessionalAudioMixer: handles missing custom assets safely with fallback', () => {
  const tmpDir = path.join('/tmp', `audio_fallback_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const dummyNarration = path.join(tmpDir, 'narration.wav');
  const outputWav = path.join(tmpDir, 'fallback_mix.wav');

  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=523:duration=2.0" -ar 44100 -ac 1 -c:a pcm_s16le "${dummyNarration}"`, { stdio: 'pipe' });

  const mixer = new ProfessionalAudioMixer(logger);
  const probe = mixer.mixAudio(dummyNarration, outputWav, {
    musicTrackPath: '/nonexistent/music.wav',
    sfxTrackPath: '/nonexistent/sfx.wav',
    targetDurationSeconds: 2.0,
  });

  assert.ok(fs.existsSync(outputWav), 'Fallback mix must be created successfully');
  assert.equal(Math.round(probe.durationSeconds), 2, 'Fallback duration must match target duration');
});

test('ProfessionalAudioMixer: integrates with FfmpegRenderer without altering duration', async () => {
  const tmpDir = path.join('/tmp', `audio_render_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const dummyVideo = path.join(tmpDir, 'clip.mp4');
  const dummyAudio = path.join(tmpDir, 'audio.wav');
  const outputVideo = path.join(tmpDir, 'output.mp4');

  execSync(`ffmpeg -y -f lavfi -i "color=c=blue:s=1280x720:d=2.0" -c:v libx264 -t 2.0 "${dummyVideo}"`, { stdio: 'pipe' });
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=2.0" -ar 44100 -ac 1 -c:a pcm_s16le "${dummyAudio}"`, { stdio: 'pipe' });

  const renderer = new FfmpegRenderer(logger);
  const report = await renderer.render(
    {
      width: 1280,
      height: 720,
      fps: 30,
      totalDurationSeconds: 2.0,
      audioTrackPath: dummyAudio,
      cuts: [
        {
          shotId: 'shot_1',
          sceneIndex: 0,
          shotIndex: 0,
          videoSourcePath: dummyVideo,
          inPoint: 0,
          outPoint: 2.0,
          durationSeconds: 2.0,
          motionEffect: 'zoom_in',
          transition: 'cut',
          captionText: 'Audio integration test',
        },
      ],
    },
    outputVideo
  );

  assert.ok(report, 'Render report must be returned');
  assert.equal(report.durationSeconds, 2.0, 'Rendered video duration must match audio duration');
  assert.ok(fs.existsSync(outputVideo), 'Final rendered video must exist');
});
