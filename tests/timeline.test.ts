import test from 'node:test';
import assert from 'node:assert/strict';
import { ScenePlanner } from '../src/services/scenes/planner';
import { TimelineBuilder } from '../src/services/timeline/builder';
import { PipelineLogger } from '../src/services/logging/logger';
import { ScriptOutput, SelectedBrollScene } from '../src/types/pipeline';

test('Timeline: ScenePlanner assigns pacing and durations accurately', () => {
  const logger = new PipelineLogger();
  const planner = new ScenePlanner(logger);

  const mockScript: ScriptOutput = {
    title: 'Test Script',
    totalEstimatedSeconds: 15,
    scenes: [
      { index: 0, narration: 'Hook line', visualDescription: 'visual 0', suggestedKeywords: ['space'] },
      { index: 1, narration: 'Discovery line', visualDescription: 'visual 1', suggestedKeywords: ['stars'] },
    ],
  };

  const plan = planner.planScenes(mockScript, [4.2, 5.8]);

  assert.equal(plan.scenes.length, 2);
  assert.ok(plan.scenes[0].durationSeconds >= 4.2);
  assert.ok(plan.scenes[1].durationSeconds >= 5.8);
  assert.equal(
    plan.totalDurationSeconds,
    Math.round((plan.scenes[0].durationSeconds + plan.scenes[1].durationSeconds) * 100) / 100
  );
});

test('Timeline: TimelineBuilder builds correct cut structure', () => {
  const logger = new PipelineLogger();
  const builder = new TimelineBuilder(logger);

  const scenePlan = {
    totalDurationSeconds: 10,
    scenes: [
      {
        index: 0,
        narration: 'Scene 0',
        durationSeconds: 5,
        brollQuery: ['nebula'],
        motionEffect: 'zoom_in' as const,
        captionText: 'Scene 0',
      },
      {
        index: 1,
        narration: 'Scene 1',
        durationSeconds: 5,
        brollQuery: ['galaxy'],
        motionEffect: 'zoom_out' as const,
        captionText: 'Scene 1',
      },
    ],
  };

  const mockBroll: SelectedBrollScene[] = [
    {
      sceneIndex: 0,
      broll: {
        id: '1',
        url: '',
        videoPath: '/tmp/clip1.mp4',
        originalWidth: 1080,
        originalHeight: 1920,
        aspectRatio: 9 / 16,
        durationSeconds: 6,
        relevanceScore: 90,
        source: 'cache',
      },
      inPoint: 0,
      outPoint: 5,
    },
    {
      sceneIndex: 1,
      broll: {
        id: '2',
        url: '',
        videoPath: '/tmp/clip2.mp4',
        originalWidth: 1080,
        originalHeight: 1920,
        aspectRatio: 9 / 16,
        durationSeconds: 6,
        relevanceScore: 90,
        source: 'cache',
      },
      inPoint: 0,
      outPoint: 5,
    },
  ];

  const timeline = builder.buildTimeline(scenePlan, mockBroll, '/tmp/audio.wav');

  assert.equal(timeline.cuts.length, 2);
  assert.equal(timeline.cuts[0].motionEffect, 'zoom_in');
  assert.equal(timeline.cuts[1].motionEffect, 'zoom_out');
  assert.equal(timeline.width, 1080);
  assert.equal(timeline.height, 1920);
});
