import test from 'node:test';
import assert from 'node:assert';
import { ScriptService } from '../src/server/services/ScriptService.js';
import { ResearchService } from '../src/server/services/ResearchService.js';

test('ScriptService produces spoken narrative with hook and timing estimations', () => {
  const research = new ResearchService().generateFallbackResearch('Black Holes');
  const service = new ScriptService();
  const script = service.generateFallbackScript(research, 18);

  assert.strictEqual(script.topic, 'Black Holes');
  assert.ok(script.lines.length >= 4, 'Should have at least 4 narrative beats');
  assert.ok(script.lines[0].narrativeRole === 'hook', 'First line should be the hook');
  assert.ok(script.estimatedTotalDurationSec > 0, 'Estimated duration must be positive');
  assert.ok(script.fullNarrationText.length > 50, 'Full narration text should be assembled');

  script.lines.forEach((line) => {
    assert.ok(line.id.startsWith('line_'));
    assert.ok(line.estimatedDurationSec >= 1.5, 'Each line should have realistic duration');
  });
});
