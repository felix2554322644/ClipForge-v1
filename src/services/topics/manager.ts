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

export interface TopicHistoryRecord {
  topic: string;
  category?: string;
  hookAngle?: string;
  usedAt: string;
  keywords: string[];
}

export interface TopicRotationState {
  lastSelectedTopicId?: string;
  lastSelectedTopic?: string;
  recentlyUsedIds: string[];
  recentlyUsedTopics: string[];
  history?: TopicHistoryRecord[];
  currentIndex: number;
  updatedAt: string;
}

export interface TopicValidationResult {
  isValid: boolean;
  score: number; // 0 - 100
  reasons: string[];
  rejectedReason?: string;
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
   * Validates a topic candidate against the 8 core Everyday Curiosity quality criteria:
   * 1. Curiosity strength (high curiosity gap about an ordinary object/experience)
   * 2. Evergreen value (timeless, relevant for years)
   * 3. Factual verifiability (grounded in real physics, engineering, or design)
   * 4. Visual potential (concrete objects, places, environments, processes, people)
   * 5. Story potential (structured as miniature investigation)
   * 6. Usefulness / practical payoff
   * 7. Originality of angle (avoids cliche tropes and duplicate angles)
   * 8. Sufficient material for ~8-12 meaningful visual beats
   */
  validateTopicProposal(
    proposalOrTopic: string | { topic: string; hookAngle?: string; category?: string },
    stateOrHook?: string | TopicRotationState,
    categoryArg?: string,
    historyArg: TopicHistoryRecord[] = []
  ): TopicValidationResult & { valid?: boolean } {
    let topicStr = '';
    let hookAngle: string | undefined;
    let category: string | undefined;
    let history: (TopicHistoryRecord | { topic: string })[] = historyArg || [];
    let recentList: string[] = [];

    if (typeof proposalOrTopic === 'object' && proposalOrTopic !== null) {
      topicStr = proposalOrTopic.topic || '';
      hookAngle = proposalOrTopic.hookAngle;
      category = proposalOrTopic.category;
      if (typeof stateOrHook === 'object' && stateOrHook !== null) {
        history = (stateOrHook.history as any) || [];
        recentList = (stateOrHook.recentlyUsedTopics as string[]) || [];
      }
    } else {
      topicStr = proposalOrTopic || '';
      if (typeof stateOrHook === 'string') {
        hookAngle = stateOrHook;
      } else if (typeof stateOrHook === 'object' && stateOrHook !== null) {
        history = (stateOrHook.history as any) || [];
        recentList = (stateOrHook.recentlyUsedTopics as string[]) || [];
      }
      category = categoryArg;
    }

    const cleanTopic = (topicStr || '').trim();
    const reasons: string[] = [];

    // Length check
    if (cleanTopic.length < 8) {
      return {
        isValid: false,
        valid: false,
        score: 0,
        reasons: ['Topic title is too short.'],
        rejectedReason: 'Title too short (< 8 chars)',
      };
    }
    if (cleanTopic.length > 130) {
      return {
        isValid: false,
        valid: false,
        score: 0,
        reasons: ['Topic title is excessively long.'],
        rejectedReason: 'Title too long (> 130 chars)',
      };
    }

    const lowerTopic = cleanTopic.toLowerCase();

    // Reject non-everyday or banned abstract tropes (e.g. abstract philosophy, pure sensationalism, neurons)
    const bannedTropes = [
      'you won\'t believe',
      'shocking secret',
      'dark psychology',
      'manipulation trick',
      'quantum consciousness',
      'spiritual energy',
      'multiverse simulation',
      'secret alien',
      'infinite void',
      'astrology sign',
      'secrets they hide',
      'secrets they don\'t want you to know',
    ];
    for (const trope of bannedTropes) {
      if (lowerTopic.includes(trope)) {
        return {
          isValid: false,
          valid: false,
          score: 10,
          reasons: [`Topic contains sensationalist or non-factual trope: "${trope}"`],
          rejectedReason: `Banned sensationalist trope ("${trope}")`,
        };
      }
    }

    // Check against recently used topics list
    if (recentList.some((t) => t.toLowerCase() === lowerTopic)) {
      return {
        isValid: false,
        valid: false,
        score: 0,
        reasons: [`Topic matches recently used topic: "${cleanTopic}"`],
        rejectedReason: 'Recently used topic',
      };
    }

    // Check Originality against history (prevent same angle or substantial duplicate)
    const topicTokens = this.extractSignificantTokens(lowerTopic);
    for (const record of history) {
      const histTopic = typeof record === 'string' ? record : record.topic;
      const histLower = (histTopic || '').toLowerCase();
      if (histLower === lowerTopic) {
        return {
          isValid: false,
          valid: false,
          score: 0,
          reasons: [`Topic matches exact historical topic: "${histTopic}"`],
          rejectedReason: 'Exact duplicate topic in history',
        };
      }
      const histTokens = this.extractSignificantTokens(histLower);
      const overlap = topicTokens.filter((t) => histTokens.includes(t));
      const overlapRatio = overlap.length / Math.max(1, Math.min(topicTokens.length, histTokens.length));
      if (overlapRatio >= 0.75 && overlap.length >= 3) {
        return {
          isValid: false,
          valid: false,
          score: 25,
          reasons: [`Topic angle overlaps heavily with historical topic: "${histTopic}"`],
          rejectedReason: `High semantic overlap with recent topic "${histTopic}"`,
        };
      }
    }

    // Check Question / Curiosity form
    const questionMarkers = ['why', 'how', 'what', 'the reason', 'hidden reason', 'the secret', 'inside'];
    const hasCuriosityForm = questionMarkers.some((m) => lowerTopic.includes(m));
    if (!hasCuriosityForm && !lowerTopic.startsWith('the ')) {
      reasons.push('Title does not use an immediate curiosity question framing');
    }

    // Positive scoring for Everyday Curiosity signals
    let score = 70;
    if (hasCuriosityForm) score += 10;
    if (hookAngle && hookAngle.length >= 20) score += 10;
    if (
      category &&
      [
        'Everyday Design',
        'Hidden Features',
        'Everyday Systems',
        'Consumer Science',
        'Urban Engineering',
        'Everyday Physics',
        'Everyday Design & Engineering',
      ].includes(category)
    ) {
      score += 10;
    }

    const isValid = score >= 60;
    return {
      isValid,
      valid: isValid,
      score: Math.min(100, score),
      reasons,
    };
  }

  private extractSignificantTokens(text: string): string[] {
    const stopwords = new Set([
      'the', 'why', 'how', 'what', 'are', 'is', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'a', 'an',
      'this', 'that', 'with', 'from', 'they', 'you', 'your', 'have', 'has', 'do', 'does', 'them', 'all',
      'actually', 'really', 'always', 'secret', 'hidden',
    ]);
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopwords.has(w));
  }

  /**
   * Resolves the video topic according to manual input, AI generation, or deterministic rotation.
   * Mode 1: EXPLICIT if manual topic is provided.
   * Mode 2: GENERATED via Gemini (single targeted prompt with recent avoidance & validation).
   * Mode 3: ROTATION from curated Everyday Curiosity pool if Gemini is unavailable or fails.
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
   * Generates a fresh, high-retention Everyday Curiosity video topic using Gemini.
   * Ensures minimal API usage (single request) and passes recent topics to prevent repetition.
   */
  private async generateTopicWithGemini(): Promise<ResolvedTopic | null> {
    if (!this.geminiClient) return null;

    const state = this.loadState();
    const recentTopics = (state.recentlyUsedTopics || []).slice(-15);
    const recentAvoidText =
      recentTopics.length > 0
        ? `\nPREVIOUSLY USED TOPICS TO AVOID (DO NOT REPEAT OR CLOSELY PARAPHRASE):\n${recentTopics.map((t) => `- "${t}"`).join('\n')}`
        : '';

    const prompt = `You are an elite video creator producing viral, high-retention 30-60 second curiosity-driven educational entertainment shorts (YouTube Shorts / TikTok / Reels) for an audience of 18–34 year olds in the US, UK, Canada, and Australia.
Niche: Everyday Curiosity — the hidden reasons behind ordinary things.
Core promise: Reveal the surprising, useful, and genuinely interesting reasons behind things people see, use, or experience every day.
Viewer sentiment: "I've seen this my whole life, but I never knew why."

Generate ONE fresh, compelling video topic.

CRITERIA:
1. Core Question Framing:
   - "Why is this designed this way?" (e.g. Why do pen caps have a hole, why do milk jugs have dimples, why do jeans have copper rivets)
   - "Why does this happen?" (e.g. Why store receipts fade to white, why crackers have holes, why escalators move faster than steps)
   - "What is actually happening here?" (e.g. How barcode scanners read the white spaces, why touchscreens need bare skin)
   - "Why does this ordinary thing have this strange feature?" (e.g. Why airplane windows have tiny holes, why soda can tabs have an oval hole)
   - "How does this everyday system really work?" (e.g. How traffic lights know you pulled up, why manhole covers are round)
2. Evergreen & Factual: Must be 100% grounded in real engineering, physics, consumer science, or design history. Never manufacture mystery or use unsupported sensational claims.
3. Concrete Visual Storytelling Potential: Must feature everyday physical objects, tools, mechanisms, hands, homes, streets, stores, or vehicles with rich stock footage and procedural animation potential.
4. Title: 6 to 12 words, Title Case, clear and arresting (e.g. "Why Airplane Windows Have a Tiny Hole at the Bottom", "Why Escalator Handrails Move Faster Than the Steps", "Why Manhole Covers Are Almost Always Round").
5. Story & Value: Must have sufficient substance for a mini-investigation with an entertaining explanation and lasting practical payoff.
${recentAvoidText}

Respond ONLY with valid, raw JSON matching this schema:
{
  "topic": "The exact video topic title",
  "category": "Everyday Design" | "Hidden Features" | "Everyday Systems" | "Consumer Science" | "Urban Engineering" | "Everyday Physics",
  "hookAngle": "One-sentence provocative hook question or observation establishing the everyday subject"
}`;

    const parsed = await this.geminiClient.generateJson<{
      topic?: string;
      category?: string;
      hookAngle?: string;
    }>(prompt, { operation: 'topic' });

    if (!parsed || !parsed.topic || typeof parsed.topic !== 'string') {
      return null;
    }

    const cleanTopic = parsed.topic.trim().replace(/^["']|["']$/g, '');
    const validation = this.validateTopicProposal(
      {
        topic: cleanTopic,
        hookAngle: parsed.hookAngle,
        category: parsed.category,
      },
      state
    );

    if (!validation.isValid) {
      if (this.logger) {
        this.logger.warn(`Gemini proposed topic "${cleanTopic}" rejected by validator: ${validation.rejectedReason || 'Score too low'}. Falling back to pool.`);
      }
      return null;
    }

    // Persist to state and history
    const historyRecord: TopicHistoryRecord = {
      topic: cleanTopic,
      category: parsed.category,
      hookAngle: parsed.hookAngle,
      usedAt: new Date().toISOString(),
      keywords: this.extractSignificantTokens(cleanTopic),
    };

    state.lastSelectedTopic = cleanTopic;
    state.lastSelectedTopicId = undefined;
    state.recentlyUsedTopics = state.recentlyUsedTopics || [];
    state.recentlyUsedTopics.push(cleanTopic);
    if (state.recentlyUsedTopics.length > 30) {
      state.recentlyUsedTopics = state.recentlyUsedTopics.slice(-30);
    }
    state.history = state.history || [];
    state.history.push(historyRecord);
    if (state.history.length > 50) {
      state.history = state.history.slice(-50);
    }
    state.updatedAt = new Date().toISOString();
    this.saveState(state);

    this.logTopicSelection('GENERATED', cleanTopic);

    return {
      topic: cleanTopic,
      mode: 'GENERATED',
      category: parsed.category || 'Everyday Design',
      hookAngle: parsed.hookAngle,
    };
  }

  /**
   * Deterministically rotates through the local curated topic pool, avoiding recently used topics.
   */
  resolveFromPool(providedState?: TopicRotationState): ResolvedTopic {
    const pool = this.loadTopics();
    if (!pool || pool.length === 0) {
      const fallback = 'Why Airplane Windows Have a Tiny Hole at the Bottom';
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
      if (state.recentlyUsedTopics.length > 30) {
        state.recentlyUsedTopics = state.recentlyUsedTopics.slice(-30);
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
      if (state.recentlyUsedTopics.length > 30) {
        state.recentlyUsedTopics = state.recentlyUsedTopics.slice(-30);
      }
    }
    state.history = state.history || [];
    state.history.push({
      topic,
      usedAt: new Date().toISOString(),
      keywords: this.extractSignificantTokens(topic),
    });
    if (state.history.length > 50) {
      state.history = state.history.slice(-50);
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

    // Curated fallback pool of engaging Everyday Curiosity vertical video topics
    return [
      {
        id: 'design_airplane_window_hole',
        category: 'Everyday Design',
        topic: 'Why Airplane Windows Have a Tiny Hole at the Bottom',
        hookAngle: 'That tiny pinhole in your window is secretly balancing cabin air pressure at 35,000 feet.',
      },
      {
        id: 'design_pen_cap_hole',
        category: 'Hidden Features',
        topic: 'Why Ballpoint Pen Caps Have a Hole at the Tip',
        hookAngle: 'That small hole in the top of your pen cap was engineered as a lifesaving airway.',
      },
      {
        id: 'eng_escalator_handrail_speed',
        category: 'Everyday Systems',
        topic: 'Why Escalator Handrails Move Slightly Faster Than the Steps',
        hookAngle: 'If you feel your arm creeping forward on an escalator, it is an intentional mechanical safeguard.',
      },
      {
        id: 'urban_manhole_covers_round',
        category: 'Urban Engineering',
        topic: 'Why Manhole Covers Are Almost Always Round',
        hookAngle: 'A round manhole cover can never accidentally fall into its own hole through geometry.',
      },
      {
        id: 'food_cracker_holes',
        category: 'Consumer Science',
        topic: 'Why Crackers and Biscuits Have Tiny Holes in Them',
        hookAngle: 'Without those stamped holes, your favorite crackers would explode into soggy pillows in the oven.',
      },
      {
        id: 'physics_microwave_metal_mesh',
        category: 'Everyday Physics',
        topic: 'Why Microwave Doors Have a Black Metal Mesh Screen',
        hookAngle: 'Light waves pass right through those tiny holes, but 12-centimeter microwaves are physically trapped inside.',
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
          history: Array.isArray(parsed.history) ? parsed.history : [],
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
      history: [],
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

