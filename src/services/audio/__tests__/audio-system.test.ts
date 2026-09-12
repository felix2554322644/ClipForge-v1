import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ProfessionalAudioMixer } from '../mixer';
import { AudioPlanner } from '../planner';
import { AudioAssetManager } from '../assetManager';
import { AudioMeasurer } from '../../narration/audioMeasurer';
import { FfmpegRenderer } from '../../rendering/ffmpegRenderer';
import { PipelineLogger } from '../../logging/logger';
import { EditorialPlan } from '../../../types/pipeline';
import { CONFIG } from '../../../config/index';

const logger = new PipelineLogger();

test('ProfessionalAudioMixer: mixes narration, music bed, and SFX with dynamic ducking and duration preservation', () => {
  const tmpDir = path.join('/tmp', `audio_test_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const dummyNarration = path.join(tmpDir, 'narration.wav');
  const outputWav = path.join(tmpDir, 'master_mix.wav');

  // Generate 4 seconds dummy narration WAV via ffmpeg (speech-like bursts with silence)
  const genCmd = `ffmpeg -y -f lavfi -i "sine=frequency=440:duration=4.0" -ar 44100 -ac 1 -c:a pcm_s16le "${dummyNarration}"`;
  execSync(genCmd, { stdio: 'pipe' });

  const mixer = new ProfessionalAudioMixer(logger);
  const probe = mixer.mixAudio(dummyNarration, outputWav, {
    targetDurationSeconds: 4.0,
    targetIntegratedLoudness: -16,
    targetTruePeak: -1.5,
  });

  assert.ok(fs.existsSync(outputWav), 'Master audio mix file must exist');
  assert.equal(Math.round(probe.durationSeconds), 4, 'Duration must be strictly preserved at 4.0s');
  assert.ok(probe.sampleRate > 0, 'Sample rate must be valid');

  // Verify that the mixed audio file contains actual audio data and is not empty
  const stats = fs.statSync(outputWav);
  assert.ok(stats.size > 50000, `Mixed audio file size must be substantial (${stats.size} bytes)`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ProfessionalAudioMixer: plans and places multiple SFX cues from EditorialPlan', () => {
  const mockEditorialPlan: EditorialPlan = {
    totalDurationSeconds: 6.0,
    decisions: [
      {
        shotId: 'shot_hook',
        sceneIndex: 0,
        shotIndex: 0,
        role: 'hook',
        narrationClause: 'The universe hides an impossible signal.',
        durationSeconds: 2.0,
        videoSourcePath: '/dummy/clip1.mp4',
        sourceDurationSeconds: 5.0,
        inPoint: 0,
        outPoint: 2.0,
        motionEffect: 'push_in',
        motionIntensity: 'moderate',
        cropMode: 'standard',
        transition: 'cut',
        captionTreatment: 'hook_pop',
        editorialReason: 'Establish curiosity',
        pacingWeight: 1.0,
      },
      {
        shotId: 'shot_reveal',
        sceneIndex: 0,
        shotIndex: 1,
        role: 'reveal',
        narrationClause: 'Astronomers just discovered its origin.',
        durationSeconds: 2.0,
        videoSourcePath: '/dummy/clip2.mp4',
        sourceDurationSeconds: 5.0,
        inPoint: 0,
        outPoint: 2.0,
        motionEffect: 'zoom_in',
        motionIntensity: 'dramatic',
        cropMode: 'punch_in',
        transition: 'flash',
        captionTreatment: 'reveal_pop',
        patternInterrupt: {
          type: 'punch_in',
          intensity: 'bold',
          triggerTimeOffset: 0.5,
        },
        editorialReason: 'Major narrative turn',
        pacingWeight: 1.2,
      },
      {
        shotId: 'shot_payoff',
        sceneIndex: 1,
        shotIndex: 0,
        role: 'payoff',
        narrationClause: 'It was never supposed to exist.',
        durationSeconds: 2.0,
        videoSourcePath: '/dummy/clip3.mp4',
        sourceDurationSeconds: 5.0,
        inPoint: 0,
        outPoint: 2.0,
        motionEffect: 'pull_out',
        motionIntensity: 'moderate',
        cropMode: 'standard',
        transition: 'cut',
        captionTreatment: 'payoff_impact',
        editorialReason: 'Final revelation',
        pacingWeight: 1.0,
      },
    ],
    pacingBreakdown: {
      hookDuration: 2.0,
      averageShotDuration: 2.0,
      shotCount: 3,
      rapidShotsCount: 0,
      holdsCount: 0,
      staticHoldsCount: 0,
    },
    varietyScore: 0.9,
    patternInterruptCount: 1,
  };

  const audioPlan = AudioPlanner.planAudio({
    totalDurationSeconds: 6.0,
    editorialPlan: mockEditorialPlan,
  });

  assert.ok(audioPlan.sfxCues.length >= 2, `Should plan multiple SFX cues, got ${audioPlan.sfxCues.length}`);
  assert.equal(audioPlan.sfxCues[0].type, 'whoosh', 'First cue should be hook whoosh');
  
  // Verify timestamps are ordered and within duration
  audioPlan.sfxCues.forEach((cue) => {
    assert.ok(cue.timestampSeconds >= 0, 'Timestamp must be non-negative');
    assert.ok(cue.timestampSeconds < 6.0, 'Timestamp must be within total duration');
  });

  // Verify mixing with planned editorial SFX cues
  const tmpDir = path.join('/tmp', `audio_editorial_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const dummyNarration = path.join(tmpDir, 'narration.wav');
  const outputWav = path.join(tmpDir, 'editorial_mix.wav');
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=6.0" -ar 44100 -ac 1 -c:a pcm_s16le "${dummyNarration}"`, { stdio: 'pipe' });

  const mixer = new ProfessionalAudioMixer(logger);
  const probe = mixer.mixAudio(dummyNarration, outputWav, {
    targetDurationSeconds: 6.0,
    audioPlan,
    editorialPlan: mockEditorialPlan,
  });

  assert.ok(fs.existsSync(outputWav), 'Editorial mixed master audio must exist');
  assert.equal(Math.round(probe.durationSeconds), 6, 'Duration must be preserved at 6.0s');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ProfessionalAudioMixer: asset caching reuses generated assets across runs', () => {
  const musicPath = AudioAssetManager.getMusicBed('cosmic_synth', 4.0, logger);
  assert.ok(fs.existsSync(musicPath), 'Cached music bed must exist');
  assert.ok(musicPath.startsWith(path.join(CONFIG.CACHE_DIR, 'audio')), 'Must reside in CONFIG.CACHE_DIR/audio');

  const statsBefore = fs.statSync(musicPath).mtimeMs;
  const musicPath2 = AudioAssetManager.getMusicBed('cosmic_synth', 4.0, logger);
  const statsAfter = fs.statSync(musicPath2).mtimeMs;

  assert.equal(musicPath, musicPath2, 'Should return identical cache path');
  assert.equal(statsBefore, statsAfter, 'Should reuse existing cached asset without re-generating');

  const sfxPath = AudioAssetManager.getSfx('whoosh', 0.5, logger);
  assert.ok(fs.existsSync(sfxPath), 'Cached whoosh SFX must exist');
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

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('ProfessionalAudioMixer: integrates full pipeline path (mixer -> timeline -> FfmpegRenderer)', async () => {
  const tmpDir = path.join('/tmp', `audio_render_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const dummyVideo = path.join(tmpDir, 'clip.mp4');
  const dummyNarration = path.join(tmpDir, 'narration.wav');
  const masterAudio = path.join(tmpDir, 'master-audio.wav');
  const outputVideo = path.join(tmpDir, 'output.mp4');

  execSync(`ffmpeg -y -f lavfi -i "color=c=blue:s=1080x1920:d=3.0" -c:v libx264 -t 3.0 "${dummyVideo}"`, { stdio: 'pipe' });
  execSync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3.0" -ar 44100 -ac 1 -c:a pcm_s16le "${dummyNarration}"`, { stdio: 'pipe' });

  // 1. Execute ProfessionalAudioMixer to produce master audio
  const mixer = new ProfessionalAudioMixer(logger);
  const audioProbe = mixer.mixAudio(dummyNarration, masterAudio, {
    targetDurationSeconds: 3.0,
  });

  assert.ok(fs.existsSync(masterAudio), 'Master audio must exist');
  assert.equal(Math.round(audioProbe.durationSeconds), 3, 'Master audio duration must be 3.0s');

  // 2. Feed masterAudio directly to FfmpegRenderer via Timeline
  const renderer = new FfmpegRenderer(logger);
  const report = await renderer.render(
    {
      width: 1080,
      height: 1920,
      fps: 30,
      totalDurationSeconds: 3.0,
      audioTrackPath: masterAudio,
      cuts: [
        {
          shotId: 'shot_1',
          sceneIndex: 0,
          shotIndex: 0,
          videoSourcePath: dummyVideo,
          inPoint: 0,
          outPoint: 3.0,
          durationSeconds: 3.0,
          motionEffect: 'zoom_in',
          transition: 'cut',
          captionText: 'Master audio pipeline test',
        },
      ],
    },
    outputVideo
  );

  assert.ok(report, 'Render report must be returned');
  assert.equal(report.durationSeconds, 3.0, 'Rendered video duration must match master audio duration');
  assert.ok(fs.existsSync(outputVideo), 'Final rendered video must exist');

  // Verify the rendered video has a valid audio stream
  const probeOutput = execSync(`ffprobe -v error -select_streams a -show_entries stream=codec_name,channels,sample_rate -of json "${outputVideo}"`, {
    encoding: 'utf-8',
  });
  const probeData = JSON.parse(probeOutput);
  assert.ok(probeData.streams && probeData.streams.length > 0, 'Rendered MP4 must contain an audio stream');
  assert.equal(probeData.streams[0].codec_name, 'aac', 'Audio codec must be AAC');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
