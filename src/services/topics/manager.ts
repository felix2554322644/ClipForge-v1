import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../../config/index';
import { PipelineLogger } from '../logging/logger';

export interface TopicItem {
  id: string;
  category: string;
  topic: string;
}

export interface TopicsData {
  topics: TopicItem[];
}

export interface TopicRotationState {
  lastSelectedTopicId?: string;
  lastSelectedTopic?: string;
  recentlyUsedIds: string[];
  currentIndex: number;
  updatedAt: string;
}

export interface ResolvedTopic {
  topic: string;
  mode: 'EXPLICIT' | 'ROTATION';
  topicId?: string;
  category?: string;
}

export class TopicManager {
  private topicsFilePath: string;
  private stateFilePath: string;
  private logger?: PipelineLogger;

  constructor(options?: {
    topicsFilePath?: string;
    stateFilePath?: string;
    logger?: PipelineLogger;
  }) {
    this.topicsFilePath = options?.topicsFilePath || CONFIG.TOPICS_FILE;
    this.stateFilePath = options?.stateFilePath || CONFIG.TOPIC_STATE_FILE;
    this.logger = options?.logger;
  }

  /**
   * Resolves the topic according to user input or topic pool rotation.
   * Mode 1: Explicit topic if supplied.
   * Mode 2: Deterministic rotation from topics.json avoiding recent duplicates.
   */
  resolveTopic(rawTopicInput?: string): ResolvedTopic {
    const trimmedInput = (rawTopicInput || '').trim();

    const isExplicit =
      trimmedInput !== '' &&
      trimmedInput.toLowerCase() !== 'automatic' &&
      trimmedInput.toLowerCase() !== 'auto';

    if (isExplicit) {
      this.logTopicSelection('EXPLICIT', trimmedInput);
      return {
        topic: trimmedInput,
        mode: 'EXPLICIT',
      };
    }

    // Automatic topic rotation
    const pool = this.loadTopics();
    if (!pool || pool.length === 0) {
      const fallback = 'The Mystery of Deep Space Fast Radio Bursts';
      this.logTopicSelection('ROTATION', fallback);
      return {
        topic: fallback,
        mode: 'ROTATION',
      };
    }

    const state = this.loadState();

    // Find candidates not recently used
    // Keep recentlyUsedIds bounded to half the pool or at most pool.length - 1
    const maxRecentMemory = Math.max(1, Math.floor(pool.length / 2));
    const recentSet = new Set(state.recentlyUsedIds.slice(-maxRecentMemory));

    let candidate = pool.find((t) => !recentSet.has(t.id));

    // If all topics are in the recent set (or pool exhausted), reset and take next in sequence
    if (!candidate) {
      const nextIndex = (state.currentIndex + 1) % pool.length;
      candidate = pool[nextIndex];
      state.recentlyUsedIds = [candidate.id];
      state.currentIndex = nextIndex;
    } else {
      const candidateIndex = pool.findIndex((t) => t.id === candidate!.id);
      state.currentIndex = candidateIndex >= 0 ? candidateIndex : (state.currentIndex + 1) % pool.length;
      state.recentlyUsedIds.push(candidate.id);
      if (state.recentlyUsedIds.length > maxRecentMemory * 2) {
        state.recentlyUsedIds = state.recentlyUsedIds.slice(-maxRecentMemory);
      }
    }

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
    };
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
        this.logger.warn(`Failed reading topics file from ${this.topicsFilePath}: ${(err as Error).message}`);
      }
    }

    return [
      {
        id: 'science_frb',
        category: 'Science',
        topic: 'The Mystery of Deep Space Fast Radio Bursts',
      },
      {
        id: 'science_black_holes',
        category: 'Science',
        topic: 'What Happens Inside a Black Hole',
      },
      {
        id: 'tech_ai_learning',
        category: 'Technology',
        topic: 'How Artificial Intelligence Actually Learns',
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
          currentIndex: typeof parsed.currentIndex === 'number' ? parsed.currentIndex : 0,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    } catch {
      // Ignored, will return default state
    }

    return {
      recentlyUsedIds: [],
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

  private logTopicSelection(mode: 'EXPLICIT' | 'ROTATION', topic: string): void {
    console.log(`TOPIC MODE: ${mode}`);
    console.log(`SELECTED TOPIC: ${topic}`);
    if (this.logger) {
      this.logger.info(`TOPIC MODE: ${mode}`);
      this.logger.info(`SELECTED TOPIC: ${topic}`);
    }
  }
}
