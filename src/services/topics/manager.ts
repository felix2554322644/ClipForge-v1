import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../../config/index';
import { PipelineLogger } from '../logging/logger';
import { GeminiClient } from '../gemini/client';

export interface TopicItem {
  id: string;
  category: string;
  topic: string;
  hookAngle?: string;
}

export interface TopicsData {
  topics: TopicItem[];
}

export interface TopicRotationState {
  lastSelectedTopicId?: string;
  lastSelectedTopic?: string;
  recentlyUsedIds: string[];
  recentlyUsedTopics: string[];
  currentIndex: number;
  updatedAt: string;
}

export interface ResolvedTopic {
  topic: string;
  mode: 'EXPLICIT' | 'ROTATION' | 'GENERATED';
  topicId?: string;
  category?: string;
  hookAngle?: string;
}

export interface TopicManagerOptions {
  topicsFilePath?: string;
  stateFilePath?: string;
  geminiClient?: GeminiClient;
  logger?: PipelineLogger;
  enableGemini?: boolean;
}

export class TopicManager {
  private topicsFilePath: string;
  private stateFilePath: string;
  private geminiClient?: GeminiClient;
  private logger?: PipelineLogger;
  private enableGemini: boolean;

  constructor(options?: TopicManagerOptions) {
    this.topicsFilePath = options?.topicsFilePath || CONFIG.TOPICS_FILE;
    this.stateFilePath = options?.stateFilePath || CONFIG.TOPIC_STATE_FILE;
    this.geminiClient = options?.geminiClient;
    this.logger = options?.logger;
    this.enableGemini = options?.enableGemini !== false;
  }

  /**
   * Sets or replaces the Gemini client used for topic generation.
   */
  setGeminiClient(client: GeminiClient): void {
    this.geminiClient = client;
  }

  /**
   * Resolves the video topic according to manual input, AI generation, or deterministic rotation.
   * Mode 1: EXPLICIT if manual topic is provided.
   * Mode 2: GENERATED via Gemini (single targeted prompt with recent avoidance).
   * Mode 3: ROTATION from topics pool if Gemini is unavailable or fails.
   */
  async resolveTopic(rawTopicInput?: string): Promise<ResolvedTopic> {
    const trimmedInput = (rawTopicInput || '').trim();

    // 1. Explicit topic provided
    if (this.isExplicitTopic(trimmedInput)) {
      this.recordExplicitTopic(trimmedInput);
      this.logTopicSelection('EXPLICIT', trimmedInput);
      return {
        topic: trimmedInput,
        mode: 'EXPLICIT',
      };
    }

    // 2. Try Gemini topic generation if enabled and available
    if (this.enableGemini && this.geminiClient && this.geminiClient.isAvailable()) {
      try {
        const generated = await this.generateTopicWithGemini();
        if (generated) {
          return generated;
        }
      } catch (err) {
        if (this.logger) {
          this.logger.warn(
            `Gemini topic generation failed: ${(err as Error).message}. Falling back to deterministic rotation.`
          );
        }
      }
    }

    // 3. Deterministic rotation fallback from curated local pool
    return this.resolveFromPool();
  }

  /**
   * Synchronous topic resolution using local pool rotation (useful for sync callers and offline tests).
   */
  resolveTopicSync(rawTopicInput?: string): ResolvedTopic {
    const trimmedInput = (rawTopicInput || '').trim();
    if (this.isExplicitTopic(trimmedInput)) {
      this.recordExplicitTopic(trimmedInput);
      this.logTopicSelection('EXPLICIT', trimmedInput);
      return {
        topic: trimmedInput,
        mode: 'EXPLICIT',
      };
    }

    return this.resolveFromPool();
  }

  /**
   * Generates a fresh, high-retention short-form video topic using Gemini.
   * Ensures minimal API usage (single request) and passes recent topics to prevent repetition.
   */
  private async generateTopicWithGemini(): Promise<ResolvedTopic | null> {
    if (!this.geminiClient) return null;

    const state = this.loadState();
    const recentTopics = (state.recentlyUsedTopics || []).slice(-12);
    const recentAvoidText =
      recentTopics.length > 0
        ? `\nPREVIOUSLY USED TOPICS TO AVOID (DO NOT REPEAT OR CLOSELY PARAPHRASE):\n${recentTopics.map((t) => `- "${t}"`).join('\n')}`
        : '';

    const prompt = `You are an elite video creator producing viral, high-retention 30-60 second curiosity-driven educational entertainment shorts (YouTube Shorts / TikTok / Reels) for an audience of 18–34 year olds in the US, UK, Canada, and Australia.
Niche: Psychology + Human Behavior + Strange Human Mysteries.
Generate ONE fresh, compelling video topic.

CRITERIA:
1. High viral curiosity gap: A mind-bending psychological quirk, counter-intuitive human behavior, shocking brain phenomenon, or everyday mystery that hooks viewers within 2 seconds.
2. Domain:
   - Strange things the human brain does (e.g. deja vu, doorway effect, intrusive thoughts, phantom vibrations, optical illusions, sleep paralysis)
   - Social behavior and psychology (e.g. bystander effect, conformity, awkwardness, charisma, mimicry, crowd dynamics)
   - Memory, perception, emotions, habits, attraction, fear, decision-making
   - Unexplained or surprising human behaviors and everyday psychological phenomena
   - Technology-related human behavior when relevant (e.g. doomscrolling psychology, parasocial bonds, algorithmic addiction)
3. Visual Storytelling Potential: Prioritize topics with strong visual b-roll potential using real people, expressive faces, crowds, workplaces, homes, phones, cities, relationships, and everyday human environments.
4. Title: 6 to 12 words, title case, clear and arresting (e.g. "Why You Instantly Forget Why You Entered a Room", "The Creepy Psychology Behind the Uncanny Valley", "Why Your Brain Hallucinates Phone Vibrations", "Why Losing Money Hurts Twice as Much as Winning").
5. Substance: Must have clear factual depth grounded in psychological research and an intriguing revelation suitable for a 30-60s script.
${recentAvoidText}

Respond ONLY with valid, raw JSON matching this schema:
{
  "topic": "The exact video topic title",
  "category": "Psychology" | "Human Behavior" | "Brain Mysteries" | "Social Dynamics" | "Digital Psychology",
  "hookAngle": "One-sentence provocative hook question or observation"
}`;

    const parsed = await this.geminiClient.generateJson<{
      topic?: string;
      category?: string;
      hookAngle?: string;
    }>(prompt);

    if (!parsed || !parsed.topic || typeof parsed.topic !== 'string') {
      return null;
    }

    const cleanTopic = parsed.topic.trim().replace(/^["']|["']$/g, '');
    if (cleanTopic.length < 8 || cleanTopic.length > 120) {
      return null;
    }

    // Verify it is not an immediate duplicate of a recent topic
    const recentSet = new Set((state.recentlyUsedTopics || []).map((t) => t.toLowerCase().trim()));
    if (recentSet.has(cleanTopic.toLowerCase())) {
      if (this.logger) {
        this.logger.warn(`Gemini proposed duplicate topic "${cleanTopic}". Falling back to pool.`);
      }
      return null;
    }

    // Persist to state
    state.lastSelectedTopic = cleanTopic;
    state.lastSelectedTopicId = undefined;
    state.recentlyUsedTopics = state.recentlyUsedTopics || [];
    state.recentlyUsedTopics.push(cleanTopic);
    if (state.recentlyUsedTopics.length > 25) {
      state.recentlyUsedTopics = state.recentlyUsedTopics.slice(-25);
    }
    state.updatedAt = new Date().toISOString();
    this.saveState(state);

    this.logTopicSelection('GENERATED', cleanTopic);

    return {
      topic: cleanTopic,
      mode: 'GENERATED',
      category: parsed.category || 'Psychology',
      hookAngle: parsed.hookAngle,
    };
  }

  /**
   * Deterministically rotates through the local curated topic pool, avoiding recently used topics.
   */
  resolveFromPool(providedState?: TopicRotationState): ResolvedTopic {
    const pool = this.loadTopics();
    if (!pool || pool.length === 0) {
      const fallback = 'Why You Instantly Forget Why You Entered a Room';
      this.logTopicSelection('ROTATION', fallback);
      return {
        topic: fallback,
        mode: 'ROTATION',
      };
    }

    const state = providedState || this.loadState();
    const recentIdSet = new Set(state.recentlyUsedIds || []);
    const recentTopicSet = new Set(
      (state.recentlyUsedTopics || []).map((t) => t.toLowerCase().trim())
    );

    // Sequential search starting after the previous selection
    const startIndex =
      typeof state.currentIndex === 'number' && state.currentIndex >= 0
        ? (state.currentIndex + 1) % pool.length
        : 0;

    let candidate: TopicItem | undefined;
    let candidateIndex = -1;

    for (let i = 0; i < pool.length; i++) {
      const checkIdx = (startIndex + i) % pool.length;
      const item = pool[checkIdx];
      const isIdRecent = recentIdSet.has(item.id);
      const isTopicRecent = recentTopicSet.has(item.topic.toLowerCase().trim());

      if (!isIdRecent && !isTopicRecent) {
        candidate = item;
        candidateIndex = checkIdx;
        break;
      }
    }

    // If all topics in the pool have been used in the current cycle, cycle forward and reset memory
    if (!candidate) {
      candidateIndex = startIndex;
      candidate = pool[candidateIndex];
      state.recentlyUsedIds = [candidate.id];
      // Retain the immediately preceding topic in memory to avoid 2 identical consecutive runs
      const lastTopic = state.lastSelectedTopic;
      state.recentlyUsedTopics = lastTopic ? [lastTopic, candidate.topic] : [candidate.topic];
    } else {
      state.recentlyUsedIds.push(candidate.id);
      state.recentlyUsedTopics.push(candidate.topic);
      if (state.recentlyUsedIds.length > pool.length) {
        state.recentlyUsedIds = state.recentlyUsedIds.slice(-Math.floor(pool.length / 2));
      }
      if (state.recentlyUsedTopics.length > 25) {
        state.recentlyUsedTopics = state.recentlyUsedTopics.slice(-25);
      }
    }

    state.currentIndex = candidateIndex;
    state.lastSelectedTopicId = candidate.id;
    state.lastSelectedTopic = candidate.topic;
    state.updatedAt = new Date().toISOString();
    this.saveState(state);

    this.logTopicSelection('ROTATION', candidate.topic);

    return {
      topic: candidate.topic,
      mode: 'ROTATION',
      topicId: candidate.id,
      category: candidate.category,
      hookAngle: candidate.hookAngle,
    };
  }

  /**
   * Checks if an input represents an explicit user-supplied topic.
   */
  private isExplicitTopic(raw?: string): boolean {
    if (!raw) return false;
    const trimmed = raw.trim().toLowerCase();
    return (
      trimmed !== '' &&
      trimmed !== 'automatic' &&
      trimmed !== 'auto' &&
      trimmed !== 'default'
    );
  }

  /**
   * Records an explicit topic in recent memory to prevent immediate duplication on future automatic runs.
   */
  private recordExplicitTopic(topic: string): void {
    const state = this.loadState();
    state.lastSelectedTopic = topic;
    state.recentlyUsedTopics = state.recentlyUsedTopics || [];
    if (!state.recentlyUsedTopics.includes(topic)) {
      state.recentlyUsedTopics.push(topic);
      if (state.recentlyUsedTopics.length > 25) {
        state.recentlyUsedTopics = state.recentlyUsedTopics.slice(-25);
      }
    }
    state.updatedAt = new Date().toISOString();
    this.saveState(state);
  }

  loadTopics(): TopicItem[] {
    try {
      if (fs.existsSync(this.topicsFilePath)) {
        const raw = fs.readFileSync(this.topicsFilePath, 'utf-8');
        const parsed: TopicsData = JSON.parse(raw);
        if (Array.isArray(parsed.topics) && parsed.topics.length > 0) {
          return parsed.topics;
        }
      }
    } catch (err) {
      if (this.logger) {
        this.logger.warn(
          `Failed reading topics file from ${this.topicsFilePath}: ${(err as Error).message}`
        );
      }
    }

    // Curated fallback pool of engaging vertical video topics
    return [
      {
        id: 'science_frb',
        category: 'Science',
        topic: 'The Mystery of Deep Space Fast Radio Bursts',
        hookAngle: 'Mysterious radio pulses from deep space repeating with mathematical precision',
      },
      {
        id: 'science_black_holes',
        category: 'Science',
        topic: 'What Happens Inside a Black Hole',
        hookAngle: 'Where space and time swap places and physics breaks completely',
      },
      {
        id: 'science_neutron_stars',
        category: 'Science',
        topic: 'Why Neutron Stars Are So Strange',
        hookAngle: 'A single teaspoon of this star weighs as much as Mount Everest',
      },
      {
        id: 'tech_ai_learning',
        category: 'Technology',
        topic: 'How Artificial Intelligence Actually Learns',
        hookAngle: 'How silicon chips learn to recognize faces and speak like humans',
      },
      {
        id: 'nature_octopus_camouflage',
        category: 'Nature',
        topic: 'How Octopuses Instantly Change Color',
        hookAngle: 'Creatures with three hearts that turn invisible in two hundred milliseconds',
      },
      {
        id: 'nature_deep_sea_vents',
        category: 'Nature',
        topic: 'The Alien Creatures of Deep Sea Hydrothermal Vents',
        hookAngle: 'Monsters living in boiling toxic water with zero sunlight',
      },
    ];
  }

  loadState(): TopicRotationState {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          lastSelectedTopicId: parsed.lastSelectedTopicId,
          lastSelectedTopic: parsed.lastSelectedTopic,
          recentlyUsedIds: Array.isArray(parsed.recentlyUsedIds) ? parsed.recentlyUsedIds : [],
          recentlyUsedTopics: Array.isArray(parsed.recentlyUsedTopics)
            ? parsed.recentlyUsedTopics
            : [],
          currentIndex: typeof parsed.currentIndex === 'number' ? parsed.currentIndex : 0,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    } catch {
      // Ignored, will return default state
    }

    return {
      recentlyUsedIds: [],
      recentlyUsedTopics: [],
      currentIndex: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  saveState(state: TopicRotationState): void {
    try {
      const parentDir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      if (this.logger) {
        this.logger.warn(`Failed to persist topic rotation state: ${(err as Error).message}`);
      }
    }
  }

  resetRotationState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        fs.unlinkSync(this.stateFilePath);
      }
    } catch {
      // Ignored
    }
  }

  private logTopicSelection(mode: 'EXPLICIT' | 'ROTATION' | 'GENERATED', topic: string): void {
    console.log(`TOPIC MODE: ${mode}`);
    console.log(`SELECTED TOPIC: ${topic}`);
    if (this.logger) {
      this.logger.info(`TOPIC MODE: ${mode}`);
      this.logger.info(`SELECTED TOPIC: ${topic}`);
    }
  }
}
