import test from 'node:test';
import assert from 'node:assert';
import { Validator } from '../src/server/services/Validator.js';

test('Validator fails clearly on non-existent file', async () => {
  const validator = new Validator();
  const result = await validator.validateOutput('job_test', '/tmp/does_not_exist_xyz.mp4', {
    width: 1080,
    height: 1920,
    durationSec: 15.0,
  });

  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.checks.fileExists, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].includes('Video file does not exist'));
});
