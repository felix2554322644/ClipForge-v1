import test from 'node:test';
import assert from 'node:assert';
import { ScenePlanner } from '../src/server/services/ScenePlanner.js';
import { ScriptService } from '../src/server/services/ScriptService.js';
import { ResearchService } from '../src/server/services/ResearchService.js';

test('ScenePlanner maps script lines into visual scenes with targeted queries', () => {
  const research = new ResearchService().generateFallbackResearch('Supernovas');
  const script = new ScriptService().generateFallbackScript(research, 20);
  const planner = new ScenePlanner();
  const plan = planner.generateFallbackScenePlan(script);

  assert.strictEqual(plan.scenes.length, script.lines.length);
  assert.strictEqual(plan.targetAspectRatio, '9:16');
  assert.ok(plan.totalPlannedDurationSec > 0);

  plan.scenes.forEach((scene, index) => {
    assert.strictEqual(scene.sceneId, `scene_${index + 1}`);
    assert.ok(scene.searchQueries.length >= 2, 'Must provide multiple search queries');
    assert.ok(scene.visualObjective.length > 5);
    assert.ok(['slow_zoom_in', 'slow_zoom_out', 'static'].includes(scene.editingGuidance.cameraMotion));
  });
});
