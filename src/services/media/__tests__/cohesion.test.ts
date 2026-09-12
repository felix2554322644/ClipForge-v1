import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { VisualCohesionService } from '../cohesion';
import { PipelineLogger } from '../../logging/logger';

const logger = new PipelineLogger();

test('VisualCohesionService: subject-aware reframing for 9:16 and 16:9 targets', () => {
  const tmpDir = path.join('/tmp', `cohesion_test_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const inputVideo = path.join(tmpDir, 'input.mp4');
  const outputVertical = path.join(tmpDir, 'output_9_16.mp4');
  const outputLandscape = path.join(tmpDir, 'output_16_9.mp4');

  execSync(`ffmpeg -y -f lavfi -i "color=c=red:s=1280x720:d=2.0" -c:v libx264 -t 2.0 "${inputVideo}"`, { stdio: 'pipe' });

  const service = new VisualCohesionService(logger);

  // Test 9:16 reframe
  service.processShotVisuals(inputVideo, outputVertical, 'push_in', 'standard', true, undefined, {
    targetWidth: 1080,
    targetHeight: 1920,
  });
  assert.ok(fs.existsSync(outputVertical), 'Vertical 9:16 reframed video must exist');

  // Test 16:9 reframe
  service.processShotVisuals(inputVideo, outputLandscape, 'static', 'standard', false, undefined, {
    targetWidth: 1920,
    targetHeight: 1080,
  });
  assert.ok(fs.existsSync(outputLandscape), 'Landscape 16:9 reframed video must exist');
});

test('VisualCohesionService: stabilization and natural motion preservation', () => {
  const tmpDir = path.join('/tmp', `stabilization_test_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const inputVideo = path.join(tmpDir, 'input_jitter.mp4');
  const outputStabilized = path.join(tmpDir, 'stabilized.mp4');

  execSync(`ffmpeg -y -f lavfi -i "color=c=blue:s=1280x720:d=2.0" -c:v libx264 -t 2.0 "${inputVideo}"`, { stdio: 'pipe' });

  const service = new VisualCohesionService(logger);
  service.processShotVisuals(inputVideo, outputStabilized, 'push_in', 'standard', true, undefined, {
    enableStabilization: true,
  });

  assert.ok(fs.existsSync(outputStabilized), 'Stabilized video output must exist');
});

test('VisualCohesionService: consecutive-shot visual continuity enforcement', () => {
  const service = new VisualCohesionService(logger);

  const plan = {
    totalDurationSeconds: 6.0,
    format: 'short' as const,
    decisions: [
      {
        shotId: 's1',
        sceneIndex: 0,
        shotIndex: 0,
        role: 'hook' as const,
        narrationClause: 'Hook clause',
        durationSeconds: 3.0,
        videoSourcePath: '/tmp/test.mp4',
        sourceDurationSeconds: 5.0,
        inPoint: 0,
        outPoint: 3.0,
        motionEffect: 'push_in' as const,
        motionIntensity: 'moderate' as const,
        cropMode: 'standard' as const,
        transition: 'cut' as const,
        captionTreatment: 'hook_pop' as const,
        editorialReason: 'Hook shot',
        pacingWeight: 1.0,
      },
      {
        shotId: 's2',
        sceneIndex: 0,
        shotIndex: 1,
        role: 'fact' as const,
        narrationClause: 'Body clause',
        durationSeconds: 3.0,
        videoSourcePath: '/tmp/test.mp4',
        sourceDurationSeconds: 5.0,
        inPoint: 3.0,
        outPoint: 6.0,
        motionEffect: 'push_in' as const, // Duplicate motion
        motionIntensity: 'moderate' as const,
        cropMode: 'standard' as const,
        transition: 'cut' as const,
        captionTreatment: 'standard' as const,
        editorialReason: 'Body shot',
        pacingWeight: 1.0,
      },
    ],
    pacingBreakdown: {
      hookDuration: 3.0,
      averageShotDuration: 3.0,
      shotCount: 2,
      rapidShotsCount: 0,
      holdsCount: 2,
      staticHoldsCount: 0,
    },
    varietyScore: 80,
    visualContinuityScore: 90,
    compositionVarietyScore: 85,
    repetitionPenalties: 0,
    patternInterruptCount: 0,
    editorialNarrativeArc: 'Arc',
  };

  const adjustedPlan = service.enforceEditorialContinuity(plan);
  assert.equal(adjustedPlan.decisions[0].motionEffect, 'push_in', 'First shot motion preserved');
  assert.notEqual(adjustedPlan.decisions[1].motionEffect, 'push_in', 'Consecutive identical motion must be adjusted for continuity');
});
