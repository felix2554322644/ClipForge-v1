import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TimelineBuilder } from '../src/services/timeline/builder';
import { PipelineLogger } from '../src/services/logging/logger';
import {
  BrollSelectionArtifact,
  NarrationArtifact,
  ScenePlanArtifact,
} from '../src/contracts/artifacts';

describe('Timeline Synchronization & Master Audio Clock', () => {
  const logger = new PipelineLogger('test_job');
  const builder = new TimelineBuilder(logger);

  const mockNarration: NarrationArtifact = {
    text: 'A star approaches the event horizon. Gravity tears it to pieces. Radiant energy blasts through the cosmos.',
    audioPath: '/tmp/test_audio.wav',
    audioDurationSec: 16.425, // Master clock anchor
    sampleRate: 22050,
    channels: 1,
    voiceConfig: { engine: 'piper', voiceName: 'en_US-lessac' },
    lineTimings: [
      { index: 1, text: 'A star approaches the event horizon.', startTimeSec: 0, durationSec: 5.2 },
      { index: 2, text: 'Gravity tears it to pieces.', startTimeSec: 5.2, durationSec: 5.5 },
      { index: 3, text: 'Radiant energy blasts through the cosmos.', startTimeSec: 10.7, durationSec: 5.725 },
    ],
    measuredWith: 'ffprobe',
    metadata: { generatedAt: new Date().toISOString() },
  };

  const mockScenePlan: ScenePlanArtifact = {
    scenes: [
      {
        sceneId: 'scene_1',
        narrationSegment: 'A star approaches the event horizon.',
        targetDurationSec: 5.2,
        visualObjective: 'Scale and approach',
        visualDescription: 'Star drifting towards dark void',
        pexelsSearchQueries: ['star space'],
        visualPriority: 'high',
        suggestedMotion: 'zoom_in',
        suggestedCrop: 'center',
        editingGuidance: 'Hold wide',
      },
      {
        sceneId: 'scene_2',
        narrationSegment: 'Gravity tears it to pieces.',
        targetDurationSec: 5.5,
        visualObjective: 'Tidal disruption',
        visualDescription: 'Plasma ripping apart',
        pexelsSearchQueries: ['plasma energy'],
        visualPriority: 'normal',
        suggestedMotion: 'zoom_out',
        suggestedCrop: 'center',
        editingGuidance: 'Dynamic punch',
      },
      {
        sceneId: 'scene_3',
        narrationSegment: 'Radiant energy blasts through the cosmos.',
        targetDurationSec: 5.0, // note: planned is slightly shorter than remaining audio
        visualObjective: 'Explosion aftermath',
        visualDescription: 'Cosmic explosion',
        pexelsSearchQueries: ['explosion space'],
        visualPriority: 'high',
        suggestedMotion: 'zoom_in',
        suggestedCrop: 'center',
        editingGuidance: 'End on wide vista',
      },
    ],
    totalScenes: 3,
    totalEstimatedDurationSec: 15.7,
    metadata: { model: 'test', generatedAt: new Date().toISOString() },
  };

  const mockBroll: BrollSelectionArtifact = {
    selections: [
      {
        sceneId: 'scene_1',
        selectedClip: {
          id: 1,
          url: 'http://example.com/1.mp4',
          localPath: '/tmp/clip1.mp4',
          duration: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          orientation: 'landscape',
          score: 85,
          reason: 'Good match',
        },
        evaluatedCandidates: [],
      },
      {
        sceneId: 'scene_2',
        selectedClip: {
          id: 2,
          url: 'http://example.com/2.mp4',
          localPath: '/tmp/clip2.mp4',
          duration: 10,
          width: 1080,
          height: 1920,
          fps: 30,
          orientation: 'portrait',
          score: 95,
          reason: 'Native vertical',
        },
        evaluatedCandidates: [],
      },
      {
        sceneId: 'scene_3',
        selectedClip: {
          id: 3,
          url: 'http://example.com/3.mp4',
          localPath: '/tmp/clip3.mp4',
          duration: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          orientation: 'landscape',
          score: 80,
          reason: 'Matches explosion',
        },
        evaluatedCandidates: [],
      },
    ],
    totalSelectedClips: 3,
    cacheHits: 0,
    downloads: 3,
    metadata: { generatedAt: new Date().toISOString() },
  };

  it('should anchor the final clip to exactly match the measured audio duration', () => {
    const timeline = builder.buildTimeline(mockScenePlan, mockNarration, mockBroll, 'vertical-1080');

    assert.strictEqual(timeline.tracks.videoClips.length, 3);
    assert.strictEqual(timeline.actualAudioDurationSec, 16.425);
    assert.strictEqual(timeline.totalVisualDurationSec, 16.425);

    const lastClip = timeline.tracks.videoClips[2];
    assert.strictEqual(lastClip.endTime, 16.425);
    assert.strictEqual(lastClip.duration, Number((16.425 - (5.2 + 5.5)).toFixed(3)));
  });

  it('should store reframing calculations in the timeline artifact', () => {
    const timeline = builder.buildTimeline(mockScenePlan, mockNarration, mockBroll, 'vertical-1080');

    const landscapeClip = timeline.tracks.videoClips[0];
    assert.strictEqual(landscapeClip.reframing.targetWidth, 1080);
    assert.strictEqual(landscapeClip.reframing.targetHeight, 1920);
    assert.strictEqual(landscapeClip.reframing.cropHeight, 1080);
    assert.ok(landscapeClip.reframing.cropWidth <= 608);

    const portraitClip = timeline.tracks.videoClips[1];
    assert.strictEqual(portraitClip.reframing.targetWidth, 1080);
    assert.strictEqual(portraitClip.reframing.targetHeight, 1920);
    assert.strictEqual(portraitClip.reframing.cropWidth, 1080);
    assert.strictEqual(portraitClip.reframing.cropHeight, 1920);
  });
});
