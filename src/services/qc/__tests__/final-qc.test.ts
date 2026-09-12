import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { FinalQualityControlService } from '../finalQc';
import { PipelineLogger } from '../../logging/logger';

const logger = new PipelineLogger();

test('FinalQualityControlService: deterministic frame sampling and extraction', () => {
  const tmpDir = path.join('/tmp', `qc_test_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const dummyVideo = path.join(tmpDir, 'render.mp4');
  execSync(`ffmpeg -y -f lavfi -i "color=c=blue:s=1280x720:d=3.0" -c:v libx264 -t 3.0 "${dummyVideo}"`, { stdio: 'pipe' });

  const qc = new FinalQualityControlService(logger);
  const frames = qc.extractFrames(dummyVideo, 3.0, 2);

  assert.equal(frames.length, 2, 'Must extract exact number of requested sample frames');
  assert.ok(frames[0].base64.length > 100, 'Extracted frame base64 data must be valid');
});

test('FinalQualityControlService: deterministic technical fallback on unavailability or error', async () => {
  const tmpDir = path.join('/tmp', `qc_fallback_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const dummyVideo = path.join(tmpDir, 'render.mp4');
  execSync(`ffmpeg -y -f lavfi -i "color=c=green:s=1280x720:d=2.0" -c:v libx264 -t 2.0 "${dummyVideo}"`, { stdio: 'pipe' });

  const qc = new FinalQualityControlService(logger);
  // Force unavailability
  (qc as any).geminiClient = {
    isAvailable: () => false,
    executeWithFailover: async () => { throw new Error('Quota exceeded'); },
  };

  const report = await qc.evaluateVideo(dummyVideo, 2.0, { format: 'short' });

  assert.ok(report, 'QC report must be returned');
  assert.equal(report.method, 'deterministic_fallback', 'Must fall back to deterministic technical QC when Gemini is unavailable');
  assert.equal(report.pass, true, 'Valid video must pass deterministic QC');

  const artifactPath = path.join(tmpDir, 'final-qc.json');
  assert.ok(fs.existsSync(artifactPath), 'final-qc.json artifact must be saved alongside render');
});

test('FinalQualityControlService: strict structured JSON schema and issue validation', async () => {
  const tmpDir = path.join('/tmp', `qc_struct_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const dummyVideo = path.join(tmpDir, 'render.mp4');
  execSync(`ffmpeg -y -f lavfi -i "color=c=black:s=1280x720:d=2.0" -c:v libx264 -t 2.0 "${dummyVideo}"`, { stdio: 'pipe' });

  let callCount = 0;
  const qc = new FinalQualityControlService(logger);
  (qc as any).geminiClient = {
    isAvailable: () => true,
    executeWithFailover: async () => {
      callCount++;
      return JSON.stringify({
        overallScore: 92,
        pass: true,
        issues: [
          {
            severity: 'low',
            timestampSeconds: 1.0,
            issueCategory: 'crop_margin',
            recommendedAction: 'Adjust vertical framing slightly',
            repairable: true,
          },
        ],
        summary: 'Excellent production quality.',
      });
    },
  };

  const report = await qc.evaluateVideo(dummyVideo, 2.0);
  assert.equal(callCount, 1, 'Must make exactly ONE multimodal Gemini QC call per video');
  assert.equal(report.overallScore, 92);
  assert.equal(report.pass, true);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].repairable, true);

  const artifactPath = path.join(tmpDir, 'final-qc.json');
  assert.ok(fs.existsSync(artifactPath), 'final-qc.json artifact must be saved');
});
