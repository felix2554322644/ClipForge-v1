import test from 'node:test';
import assert from 'node:assert';
import { TimelineBuilder } from '../src/server/services/TimelineBuilder.js';
import {
  NarrationArtifact,
  ScenePlanArtifact,
  BrollSelectionArtifact,
} from '../src/types/pipeline.js';

test('TimelineBuilder synchronizes visual cuts to exact audio duration', () => {
  const builder = new TimelineBuilder();

  const narration: NarrationArtifact = {
    audioFilePath: '/tmp/narration.wav',
    durationSec: 15.0, // Actual measured audio duration
    sampleRate: 44100,
    channels: 2,
    format: 'pcm_s16le',
    ttsEngineUsed: 'test_engine',
    sentenceTimings: [
      { text: 'Hook line', startSec: 0, endSec: 5.0 },
      { text: 'Second line', startSec: 5.0, endSec: 10.0 },
      { text: 'Final line', startSec: 10.0, endSec: 15.0 },
    ],
    generatedAt: new Date().toISOString(),
  };

  const scenePlan: ScenePlanArtifact = {
    scenes: [
      {
        sceneId: 'scene_1',
        narrationText: 'Hook line',
        estimatedDurationSec: 3.0,
        visualObjective: 'Hook',
        visualDescription: 'Desc 1',
        searchQueries: ['query 1'],
        preferredBrollType: 'cinematic',
        importance: 'high',
        editingGuidance: { cameraMotion: 'slow_zoom_in', cutPacing: 'moderate', transition: 'cut' },
      },
      {
        sceneId: 'scene_2',
        narrationText: 'Second line',
        estimatedDurationSec: 3.0,
        visualObjective: 'Build',
        visualDescription: 'Desc 2',
        searchQueries: ['query 2'],
        preferredBrollType: 'action',
        importance: 'medium',
        editingGuidance: { cameraMotion: 'slow_zoom_out', cutPacing: 'moderate', transition: 'cut' },
      },
      {
        sceneId: 'scene_3',
        narrationText: 'Final line',
        estimatedDurationSec: 3.0,
        visualObjective: 'Resolution',
        visualDescription: 'Desc 3',
        searchQueries: ['query 3'],
        preferredBrollType: 'landscape',
        importance: 'high',
        editingGuidance: { cameraMotion: 'static', cutPacing: 'moderate', transition: 'cut' },
      },
    ],
    totalPlannedDurationSec: 9.0, // Initial estimate was only 9s, but audio is 15s!
    targetAspectRatio: '9:16',
    generatedAt: new Date().toISOString(),
  };

  const brollSelection: BrollSelectionArtifact = {
    selections: [
      {
        sceneId: 'scene_1',
        searchQueryUsed: 'query 1',
        selectedClip: {
          id: 'clip_1',
          provider: 'procedural',
          sourceUrl: 'procedural://1',
          localPath: '/tmp/clip1.mp4',
          originalWidth: 1080,
          originalHeight: 1920,
          originalDurationSec: 10.0,
          aspectRatio: 1080 / 1920,
          score: 85,
          scoreBreakdown: { semanticRelevance: 30, aspectRatioSuitability: 25, durationAdequacy: 15, resolutionQuality: 15 },
        },
        candidatesEvaluated: 2,
        reasoning: 'Best match',
      },
      {
        sceneId: 'scene_2',
        searchQueryUsed: 'query 2',
        selectedClip: {
          id: 'clip_2',
          provider: 'procedural',
          sourceUrl: 'procedural://2',
          localPath: '/tmp/clip2.mp4',
          originalWidth: 1920,
          originalHeight: 1080,
          originalDurationSec: 10.0,
          aspectRatio: 1920 / 1080,
          score: 80,
          scoreBreakdown: { semanticRelevance: 25, aspectRatioSuitability: 20, durationAdequacy: 15, resolutionQuality: 20 },
        },
        candidatesEvaluated: 2,
        reasoning: 'Best match',
      },
      {
        sceneId: 'scene_3',
        searchQueryUsed: 'query 3',
        selectedClip: {
          id: 'clip_3',
          provider: 'procedural',
          sourceUrl: 'procedural://3',
          localPath: '/tmp/clip3.mp4',
          originalWidth: 1080,
          originalHeight: 1920,
          originalDurationSec: 10.0,
          aspectRatio: 1080 / 1920,
          score: 90,
          scoreBreakdown: { semanticRelevance: 30, aspectRatioSuitability: 25, durationAdequacy: 15, resolutionQuality: 20 },
        },
        candidatesEvaluated: 2,
        reasoning: 'Best match',
      },
    ],
    cacheHits: 0,
    downloadsCount: 3,
    generatedAt: new Date().toISOString(),
  };

  const timeline = builder.buildTimeline('test_job', narration, scenePlan, brollSelection, {
    width: 1080,
    height: 1920,
    fps: 30,
  });

  assert.strictEqual(timeline.totalDurationSec, 15.0);
  assert.strictEqual(timeline.videoClips.length, 3);

  const totalClipsDuration = timeline.videoClips.reduce((sum, c) => sum + c.clipDurationSec, 0);
  assert.ok(Math.abs(totalClipsDuration - 15.0) < 0.1, `Sum of clips (${totalClipsDuration}s) must equal narration duration (15.0s)`);
  assert.strictEqual(timeline.videoClips[0].timelineStartSec, 0);
  assert.strictEqual(timeline.videoClips[timeline.videoClips.length - 1].timelineEndSec, 15.0);
});
