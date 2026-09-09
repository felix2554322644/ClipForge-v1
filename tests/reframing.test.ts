import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { VideoReframer } from '../src/services/media/reframing';
import { CONFIG } from '../src/config/index';

test('Reframing: Crops and scales landscape video to 1080x1920 portrait', () => {
  const tmpDir = path.join(CONFIG.CACHE_DIR, 'test_reframe');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const inputLandscape = path.join(tmpDir, 'sample_landscape.mp4');
  const outputPortrait = path.join(tmpDir, 'sample_portrait.mp4');

  // Generate 1-second 640x360 landscape test video
  execSync(
    `ffmpeg -y -f lavfi -i "testsrc=size=640x360:rate=30:duration=1" -c:v libx264 -pix_fmt yuv420p "${inputLandscape}"`,
    { stdio: 'pipe' }
  );

  VideoReframer.reframeToPortrait(inputLandscape, outputPortrait, 1080, 1920);

  assert.ok(fs.existsSync(outputPortrait), 'Reframed output missing');

  // Probe output dimensions with ffprobe
  const probeRaw = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${outputPortrait}"`,
    { encoding: 'utf-8' }
  );
  const probe = JSON.parse(probeRaw);

  assert.equal(probe.streams[0].width, 1080);
  assert.equal(probe.streams[0].height, 1920);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
