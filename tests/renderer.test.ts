import test from 'node:test';
import assert from 'node:assert';
import { Renderer } from '../src/server/services/Renderer.js';
import { TimelineArtifact } from '../src/types/pipeline.js';

test('Renderer constructs valid FFmpeg filter graph and arguments', () => {
  const renderer = new Renderer();

  const mockTimeline: TimelineArtifact = {
    totalDurationSec: 6.0,
    canvas: {
      width: 1080,
      height: 1920,
      fps: 30,
      aspectRatio: '9:16',
    },
    narrationAudioPath: '/tmp/test_narration.wav',
    videoClips: [
      {
        sceneId: 'scene_1',
        clipPath: '/tmp/clip1.mp4',
        timelineStartSec: 0,
        timelineEndSec: 3.0,
        clipDurationSec: 3.0,
        clipTrimStartSec: 0.5,
        clipTrimEndSec: 3.5,
        visualObjective: 'Scene 1',
        editingPrimitives: {
          crop: { x: 0, y: 0, width: 1080, height: 1920 },
          scale: { width: 1080, height: 1920 },
        },
      },
      {
        sceneId: 'scene_2',
        clipPath: '/tmp/clip2.mp4',
        timelineStartSec: 3.0,
        timelineEndSec: 6.0,
        clipDurationSec: 3.0,
        clipTrimStartSec: 0.0,
        clipTrimEndSec: 3.0,
        visualObjective: 'Scene 2',
        editingPrimitives: {
          crop: { x: 420, y: 0, width: 1080, height: 1920 },
          scale: { width: 1920, height: 1920 },
        },
      },
    ],
    generatedAt: new Date().toISOString(),
  };

  const { args, filterGraph } = renderer.buildFfmpegCommand(mockTimeline, '/tmp/output.mp4');

  assert.ok(args.includes('-i'), 'Command must include input flags');
  assert.ok(args.includes('/tmp/clip1.mp4'));
  assert.ok(args.includes('/tmp/clip2.mp4'));
  assert.ok(args.includes('/tmp/test_narration.wav'));
  assert.ok(args.includes('-filter_complex'));
  assert.ok(filterGraph.includes('concat=n=2:v=1:a=0[vcat]'), 'Must concatenate 2 video inputs');
  assert.ok(args.includes('libx264'));
  assert.ok(args.includes('aac'));
  assert.ok(args.includes('+faststart'));
});
