import test from 'node:test';
import assert from 'node:assert';
import { ResearchService } from '../src/server/services/ResearchService.js';

test('ResearchService generates structured factual foundation', async () => {
  const service = new ResearchService();
  const research = service.generateFallbackResearch('Quantum Entanglement');

  assert.strictEqual(research.topic, 'Quantum Entanglement');
  assert.ok(Array.isArray(research.keyFacts) && research.keyFacts.length >= 4);
  assert.ok(Array.isArray(research.importantEntities) && research.importantEntities.length >= 3);
  assert.ok(Array.isArray(research.chronology) && research.chronology.length >= 3);
  assert.ok(Array.isArray(research.visualOpportunities) && research.visualOpportunities.length >= 3);
  assert.ok(typeof research.generatedAt === 'string');
});
