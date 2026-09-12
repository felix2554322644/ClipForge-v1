import { GoogleGenAI } from '@google/genai';
import { CONFIG } from '../../config/index';

export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export type GeminiContents = string | { parts: GeminiPart[] } | GeminiPart[];

export interface GeminiClientOptions {
  primaryKey?: string;
  secondaryKey?: string;
  model?: string;
  maxRetriesPerKey?: number;
  initialBackoffMs?: number;
  backoffMultiplier?: number;
  logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  customRunner?: (
    keyLabel: 'PRIMARY' | 'SECONDARY',
    prompt: any,
    attempt: number
  ) => Promise<string>;
}

export function isRetryableGeminiError(err: unknown): boolean {
  if (!err) return false;

  // SyntaxError or JSON parsing error is an application error and NOT retryable on another key
  if (err instanceof SyntaxError) return false;

  const msg = err instanceof Error ? err.message : String(err);
  const status =
    (err as any)?.status ||
    (err as any)?.statusCode ||
    (err as any)?.response?.status ||
    (err as any)?.code;

  if (status === 429 || status === 503 || status === 502 || status === 504 || status === 500) {
    return true;
  }

  const retryableIndicators = [
    '429',
    '503',
    '500',
    '502',
    '504',
    'RESOURCE_EXHAUSTED',
    'rate limit',
    'quota',
    'Too Many Requests',
    'UNAVAILABLE',
    'service unavailable',
    'overloaded',
    'temporarily unavailable',
    'INTERNAL',
    'transient',
    'ECONNRESET',
    'ETIMEDOUT',
    'fetch failed',
    'socket hang up',
  ];

  const lower = msg.toLowerCase();
  return retryableIndicators.some((kw) => lower.includes(kw.toLowerCase()));
}

export function getSanitizedErrorReason(err: unknown): string {
  if (!err) return 'Unknown error';
  const msg = err instanceof Error ? err.message : String(err);
  const status =
    (err as any)?.status ||
    (err as any)?.statusCode ||
    (err as any)?.response?.status;

  if (status === 429 || msg.includes('429') || msg.toLowerCase().includes('resource_exhausted')) {
    return 'HTTP 429';
  }
  if (status === 503 || msg.includes('503') || msg.toLowerCase().includes('unavailable')) {
    return 'HTTP 503';
  }
  if (status === 500 || status === 502 || status === 504) {
    return `HTTP ${status}`;
  }
  return msg.slice(0, 60);
}

export class GeminiClient {
  private primaryKey: string;
  private secondaryKey: string;
  private model: string;
  private maxRetriesPerKey: number;
  private initialBackoffMs: number;
  private backoffMultiplier: number;
  private logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  private customRunner?: (
    keyLabel: 'PRIMARY' | 'SECONDARY',
    prompt: string,
    attempt: number
  ) => Promise<string>;

  private primaryAi?: GoogleGenAI;
  private secondaryAi?: GoogleGenAI;

  constructor(optionsOrModel?: string | GeminiClientOptions) {
    if (typeof optionsOrModel === 'string') {
      this.model = optionsOrModel;
      this.primaryKey = CONFIG.GEMINI_API_KEY;
      this.secondaryKey = CONFIG.GEMINI_API_KEY_2;
      this.maxRetriesPerKey = 2; // 1 initial + 2 retries = 3 attempts
      this.initialBackoffMs = 500;
      this.backoffMultiplier = 2;
    } else {
      const opts = optionsOrModel || {};
      this.model = opts.model || CONFIG.GEMINI_MODEL;
      this.primaryKey = opts.primaryKey ?? CONFIG.GEMINI_API_KEY;
      this.secondaryKey = opts.secondaryKey ?? CONFIG.GEMINI_API_KEY_2;
      this.maxRetriesPerKey = typeof opts.maxRetriesPerKey === 'number' ? opts.maxRetriesPerKey : 2;
      this.initialBackoffMs = typeof opts.initialBackoffMs === 'number' ? opts.initialBackoffMs : 500;
      this.backoffMultiplier = typeof opts.backoffMultiplier === 'number' ? opts.backoffMultiplier : 2;
      this.logger = opts.logger;
      this.customRunner = opts.customRunner;
    }

    if (this.primaryKey) {
      this.primaryAi = new GoogleGenAI({
        apiKey: this.primaryKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }

    if (this.secondaryKey) {
      this.secondaryAi = new GoogleGenAI({
        apiKey: this.secondaryKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  getModel(): string {
    return this.model;
  }

  isAvailable(): boolean {
    return Boolean(this.primaryKey || this.secondaryKey || this.customRunner);
  }

  hasSecondaryKey(): boolean {
    return Boolean(this.secondaryKey && this.secondaryKey.trim() !== '');
  }

  /**
   * Executes a Gemini request with bounded exponential backoff and automatic failover
   * to GEMINI_API_KEY_2 if the primary key encounters retryable quota/rate-limit errors.
   */
  async executeWithFailover(promptOrContents: GeminiContents): Promise<string> {
    const hasPrimary = Boolean(this.primaryKey && this.primaryKey.trim() !== '');
    const hasSecondary = Boolean(this.secondaryKey && this.secondaryKey.trim() !== '');

    if (!hasPrimary && !hasSecondary && !this.customRunner) {
      throw new Error('No Gemini API keys configured.');
    }

    // Step 1: Attempt using PRIMARY key
    if (hasPrimary || this.customRunner) {
      this.log('[GEMINI] Using primary API key');
      let attempt = 0;
      const maxAttempts = this.maxRetriesPerKey + 1;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          const result = await this.callAi('PRIMARY', promptOrContents, attempt);
          return result;
        } catch (err) {
          if (!isRetryableGeminiError(err)) {
            this.log(`[GEMINI] Non-retryable error with primary key: ${this.sanitize((err as Error).message)}`);
            throw err;
          }

          const reason = getSanitizedErrorReason(err);
          this.log(`[GEMINI] Request failed with ${reason}`);

          if (attempt < maxAttempts) {
            const delay = this.initialBackoffMs * Math.pow(this.backoffMultiplier, attempt - 1);
            this.log(`[GEMINI] Retrying primary key (attempt ${attempt + 1}/${maxAttempts})`);
            await this.sleep(delay);
          } else {
            this.log('[GEMINI] Primary key exhausted');
          }
        }
      }
    }

    // Step 2: Switch to SECONDARY key
    if (!hasSecondary && !this.customRunner) {
      this.log('[GEMINI] Secondary API key (GEMINI_API_KEY_2) not configured');
      throw new Error('Primary Gemini API key exhausted and secondary key (GEMINI_API_KEY_2) is not configured.');
    }

    this.log('[GEMINI] Switching to secondary API key');
    let secAttempt = 0;
    const secMaxAttempts = this.maxRetriesPerKey + 1;

    while (secAttempt < secMaxAttempts) {
      secAttempt++;
      try {
        const result = await this.callAi('SECONDARY', promptOrContents, secAttempt);
        this.log('[GEMINI] Secondary key request succeeded');
        return result;
      } catch (err) {
        if (!isRetryableGeminiError(err)) {
          this.log(`[GEMINI] Non-retryable error with secondary key: ${this.sanitize((err as Error).message)}`);
          throw err;
        }

        const reason = getSanitizedErrorReason(err);
        this.log(`[GEMINI] Request failed with ${reason}`);

        if (secAttempt < secMaxAttempts) {
          const delay = this.initialBackoffMs * Math.pow(this.backoffMultiplier, secAttempt - 1);
          this.log(`[GEMINI] Retrying secondary key (attempt ${secAttempt + 1}/${secMaxAttempts})`);
          await this.sleep(delay);
        } else {
          this.log('[GEMINI] Secondary key exhausted');
        }
      }
    }

    // Step 3: Both keys exhausted
    this.log('[GEMINI] Both primary and secondary Gemini API keys failed and are exhausted');
    throw new Error('Both configured Gemini API keys (GEMINI_API_KEY and GEMINI_API_KEY_2) failed and are exhausted.');
  }

  /**
   * Generates JSON output with failover and schema extraction.
   */
  async generateJson<T>(promptOrContents: GeminiContents, fallbackGenerator?: () => T): Promise<T> {
    if (this.isAvailable()) {
      try {
        let contentsToExecute: GeminiContents;
        const jsonPromptSuffix = '\n\nIMPORTANT: Respond ONLY with valid, raw JSON. No markdown blocks, no commentary.';

        if (typeof promptOrContents === 'string') {
          contentsToExecute = promptOrContents + jsonPromptSuffix;
        } else if (Array.isArray(promptOrContents)) {
          contentsToExecute = [...promptOrContents, { text: jsonPromptSuffix }];
        } else if (promptOrContents && typeof promptOrContents === 'object' && 'parts' in promptOrContents) {
          contentsToExecute = {
            parts: [...promptOrContents.parts, { text: jsonPromptSuffix }],
          };
        } else {
          contentsToExecute = promptOrContents;
        }

        const text = await this.executeWithFailover(contentsToExecute);

        const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
        return JSON.parse(cleaned) as T;
      } catch (err) {
        const errMsg = (err as Error).message || '';

        // If error is exhaustion of keys, STOP THE PIPELINE. Never silently fall back with fake data!
        if (errMsg.includes('exhausted')) {
          throw err;
        }

        if (!CONFIG.ALLOW_FALLBACKS) {
          throw new Error(`Gemini API call failed: ${errMsg}`);
        }

        if (fallbackGenerator) {
          return fallbackGenerator();
        }
        throw err;
      }
    }

    if (CONFIG.ALLOW_FALLBACKS && fallbackGenerator) {
      return fallbackGenerator();
    }

    throw new Error('Gemini API is unavailable (no API keys configured) and fallbacks are disabled.');
  }

  private async callAi(keyLabel: 'PRIMARY' | 'SECONDARY', promptOrContents: GeminiContents, attempt: number): Promise<string> {
    const runner = this.customRunner;
    if (runner) {
      return runner(keyLabel, promptOrContents as any, attempt);
    }

    const ai = keyLabel === 'PRIMARY' ? this.primaryAi : this.secondaryAi;
    if (!ai) {
      throw new Error(`AI instance for ${keyLabel} is not initialized.`);
    }

    let contentsPayload: any;
    if (typeof promptOrContents === 'string') {
      contentsPayload = promptOrContents;
    } else if (Array.isArray(promptOrContents)) {
      contentsPayload = { parts: promptOrContents };
    } else {
      contentsPayload = promptOrContents;
    }

    const response = await ai.models.generateContent({
      model: this.model,
      contents: contentsPayload,
    });

    return response.text || '';
  }

  private sanitize(text: string): string {
    let result = text;
    if (this.primaryKey) {
      result = result.split(this.primaryKey).join('[REDACTED_PRIMARY_KEY]');
    }
    if (this.secondaryKey) {
      result = result.split(this.secondaryKey).join('[REDACTED_SECONDARY_KEY]');
    }
    result = result.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]');
    result = result.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]');
    result = result.replace(/key=[A-Za-z0-9_-]{10,}/gi, 'key=[REDACTED_KEY]');
    return result;
  }

  private log(msg: string): void {
    const sanitized = this.sanitize(msg);
    console.log(sanitized);
    if (this.logger) {
      this.logger.info(sanitized);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
