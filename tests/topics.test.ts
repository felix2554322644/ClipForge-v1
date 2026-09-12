import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TopicManager } from '../src/services/topics/manager';
import { GeminiClient } from '../src/services/gemini/client';
import { ResearchService } from '../src/services/research/researcher';
import { PipelineLogger } from '../src/services/logging/logger';

test('TopicSystem: Different runs produce different topics across sequential invocations', async () => {
  const tmpDir = path.join('/tmp', `test_topic_diff_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const stateFilePath = path.join(tmpDir, 'topic-state.json');

  const manager = new TopicManager({
    stateFilePath,
    enableGemini: false, // test pool rotation determinism
  });

  const run1 = await manager.resolveTopic('automatic');
  const run2 = await manager.resolveTopic('auto');
  const run3 = await manager.resolveTopic('');

  assert.ok(run1.topic && run1.topic.length > 5, 'Run 1 must produce a valid topic');
  assert.ok(run2.topic && run2.topic.length > 5, 'Run 2 must produce a valid topic');
  assert.ok(run3.topic && run3.topic.length > 5, 'Run 3 must produce a valid topic');

  assert.notEqual(run1.topic, run2.topic, 'Run 1 and Run 2 must produce different topics');
  assert.notEqual(run2.topic, run3.topic, 'Run 2 and Run 3 must produce different topics');
  assert.notEqual(run1.topic, run3.topic, 'Run 1 and Run 3 must produce different topics');

  assert.equal(run1.mode, 'ROTATION');
  assert.equal(run2.mode, 'ROTATION');
  assert.equal(run3.mode, 'ROTATION');
});

test('TopicSystem: Recently used topics are strictly avoided', async () => {
  const tmpDir = path.join('/tmp', `test_topic_recent_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const stateFilePath = path.join(tmpDir, 'topic-state.json');

  // Pre-seed state with recently used topics
  const usedTopicA = 'The Mystery of Deep Space Fast Radio Bursts';
  const usedTopicB = 'What Happens Inside a Black Hole';
  const usedIdA = 'science_frb';
  const usedIdB = 'science_black_holes';

  fs.writeFileSync(
    stateFilePath,
    JSON.stringify({
      lastSelectedTopicId: usedIdB,
      lastSelectedTopic: usedTopicB,
      recentlyUsedIds: [usedIdA, usedIdB],
      recentlyUsedTopics: [usedTopicA, usedTopicB],
      currentIndex: 1,
      updatedAt: new Date().toISOString(),
    })
  );

  const manager = new TopicManager({
    stateFilePath,
    enableGemini: false,
  });

  const resolved = await manager.resolveTopic();

  assert.notEqual(resolved.topic, usedTopicA, 'Must not pick recently used topic A');
  assert.notEqual(resolved.topic, usedTopicB, 'Must not pick recently used topic B');
  assert.notEqual(resolved.topicId, usedIdA, 'Must not pick recently used ID A');
  assert.notEqual(resolved.topicId, usedIdB, 'Must not pick recently used ID B');

  // Also verify that Gemini returning an already-used topic is rejected
  let geminiCallCount = 0;
  const mockGemini = new GeminiClient({
    customRunner: async () => {
      geminiCallCount++;
      // Gemini attempts to return a topic that was already used
      return JSON.stringify({
        topic: usedTopicA,
        category: 'Science',
        hookAngle: 'Duplicate hook',
      });
    },
  });

  const aiManager = new TopicManager({
    stateFilePath,
    geminiClient: mockGemini,
    enableGemini: true,
  });

  const aiResolved = await aiManager.resolveTopic();
  // Since Gemini proposed a duplicate, TopicManager should discard it and fall back to pool
  assert.notEqual(aiResolved.topic, usedTopicA, 'Must reject duplicate proposed by Gemini');
  assert.equal(aiResolved.mode, 'ROTATION');
});

test('TopicSystem: Manual topics still work with priority and update recent memory', async () => {
  const tmpDir = path.join('/tmp', `test_topic_manual_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const stateFilePath = path.join(tmpDir, 'topic-state.json');

  const manager = new TopicManager({
    stateFilePath,
    enableGemini: true,
  });

  const explicitTopic = '  Why Neutrinos Pass Through Everything Undetected  ';
  const resolved = await manager.resolveTopic(explicitTopic);

  assert.equal(resolved.topic, 'Why Neutrinos Pass Through Everything Undetected');
  assert.equal(resolved.mode, 'EXPLICIT');

  // Verify it was recorded in the state file
  const state = manager.loadState();
  assert.equal(state.lastSelectedTopic, 'Why Neutrinos Pass Through Everything Undetected');
  assert.ok(
    state.recentlyUsedTopics.includes('Why Neutrinos Pass Through Everything Undetected'),
    'Explicit topic must be recorded in recentlyUsedTopics'
  );
});

test('TopicSystem: Fallback works seamlessly when Gemini is unavailable or errors', async () => {
  const tmpDir = path.join('/tmp', `test_topic_fallback_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const stateFilePath = path.join(tmpDir, 'topic-state.json');

  // 1. When Gemini throws an unrecoverable error
  const failingGemini = new GeminiClient({
    customRunner: async () => {
      throw new Error('RESOURCE_EXHAUSTED: Free tier quota exceeded');
    },
  });

  const manager = new TopicManager({
    stateFilePath,
    geminiClient: failingGemini,
    enableGemini: true,
  });

  const resolved = await manager.resolveTopic();
  assert.ok(resolved.topic, 'Should return a topic despite Gemini error');
  assert.equal(resolved.mode, 'ROTATION');

  // 2. When no Gemini client is configured at all
  const noGeminiManager = new TopicManager({
    stateFilePath,
    enableGemini: false,
  });

  const resolvedNoAi = await noGeminiManager.resolveTopic();
  assert.ok(resolvedNoAi.topic, 'Should return a topic when Gemini is disabled');
  assert.equal(resolvedNoAi.mode, 'ROTATION');

  // 3. When topics.json is missing or corrupted
  const corruptManager = new TopicManager({
    topicsFilePath: '/nonexistent/path/to/topics.json',
    stateFilePath,
    enableGemini: false,
  });

  const resolvedCorrupt = corruptManager.resolveFromPool();
  assert.ok(resolvedCorrupt.topic, 'Should fall back to embedded pool when file is missing');
  assert.equal(resolvedCorrupt.mode, 'ROTATION');
});

test('TopicSystem: Gemini AI generation creates fresh topic when available with single API call', async () => {
  const tmpDir = path.join('/tmp', `test_topic_ai_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const stateFilePath = path.join(tmpDir, 'topic-state.json');

  let apiCallCount = 0;
  const mockGemini = new GeminiClient({
    customRunner: async (_label, prompt) => {
      apiCallCount++;
      const promptStr = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
      // Verify prompt enforces criteria
      assert.ok(promptStr.includes('CRITERIA:'), 'Prompt must specify criteria');
      return JSON.stringify({
        topic: 'Why Time Moves Slower at the Center of the Earth',
        category: 'Physics',
        hookAngle: 'Gravitational time dilation ticks clocks slower deep underground',
      });
    },
  });

  const manager = new TopicManager({
    stateFilePath,
    geminiClient: mockGemini,
    enableGemini: true,
  });

  const resolved = await manager.resolveTopic();

  assert.equal(apiCallCount, 1, 'Must execute exactly ONE Gemini API call for topic generation');
  assert.equal(resolved.topic, 'Why Time Moves Slower at the Center of the Earth');
  assert.equal(resolved.mode, 'GENERATED');
  assert.equal(resolved.category, 'Physics');
  assert.ok(resolved.hookAngle?.includes('Gravitational'));

  // State should be updated
  const state = manager.loadState();
  assert.equal(state.lastSelectedTopic, 'Why Time Moves Slower at the Center of the Earth');
  assert.ok(state.recentlyUsedTopics.includes('Why Time Moves Slower at the Center of the Earth'));
});

test('TopicSystem: Selected topic reaches the research pipeline correctly', async () => {
  const tmpDir = path.join('/tmp', `test_topic_research_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const stateFilePath = path.join(tmpDir, 'topic-state.json');

  const manager = new TopicManager({
    stateFilePath,
    enableGemini: false,
  });

  // 1. Resolve an automatic topic
  const resolved = await manager.resolveTopic('automatic');
  assert.ok(resolved.topic);

  // 2. Feed it directly into ResearchService as the orchestrator does
  let capturedTopic = '';
  const mockGemini = new GeminiClient({
    customRunner: async (_label, prompt) => {
      const promptStr = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
      if (promptStr.includes('Analyze the topic:')) {
        // Extract topic from prompt
        const match = promptStr.match(/Analyze the topic:\s*"([^"]+)"/);
        if (match) {
          capturedTopic = match[1];
        }
      }
      return JSON.stringify({
        topic: capturedTopic,
        hook: `Did you know ${capturedTopic}?`,
        coreAngle: 'Narrative angle',
        keyFacts: ['Fact 1', 'Fact 2', 'Fact 3'],
        visualThemes: ['theme1', 'theme2'],
        recommendedPacing: 'fast',
      });
    },
  });

  const logger = new PipelineLogger();
  const researcher = new ResearchService(mockGemini, logger);
  const brief = await researcher.conductResearch(resolved.topic);

  assert.equal(capturedTopic, resolved.topic, 'Prompt to researcher must contain resolved topic');
  assert.equal(brief.topic, resolved.topic, 'Research brief topic must match resolved topic');
});
