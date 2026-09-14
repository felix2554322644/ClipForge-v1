import { GoogleGenAI } from '@google/genai';
import { CONFIG } from '../../config/index';
import {
  GeminiUsageGovernor,
  getGlobalGovernor,
  GeminiOperationType,
} from '../governor/usageGovernor';

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
  tertiaryKey?: string;
  primaryProjectId?: string;
  secondaryProjectId?: string;
  tertiaryProjectId?: string;
  keys?: string[];
  model?: string;
  maxRetriesPerKey?: number;
  initialBackoffMs?: number;
  backoffMultiplier?: number;
  cooldownMs?: number;
  governor?: GeminiUsageGovernor;
  logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  customRunner?: (
    keyLabel: any,
    prompt: any,
    attempt: number
  ) => Promise<string>;
}

export interface KeyAccount {
  id: string;
  label: string;
  slotName: string;
  apiKey: string;
  projectId: string;
  ai?: GoogleGenAI;
  cooldownUntil: number;
  consecutiveFailures: number;
  totalRequests: number;
  totalSuccesses: number;
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

export function isRateLimitGeminiError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const status =
    (err as any)?.status ||
    (err as any)?.statusCode ||
    (err as any)?.response?.status ||
    (err as any)?.code;

  if (status === 429) return true;
  const lower = msg.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('too many requests')
  );
}

export function getSanitizedErrorReason(err: unknown): string {
  if (!err) return 'Unknown error';
  const msg = err instanceof Error ? err.message : String(err);
  const status =
    (err as any)?.status ||
    (err as any)?.statusCode ||
    (err as any)?.response?.status;

  if (status === 429 || msg.includes('429') || msg.toLowerCase().includes('resource_exhausted')) {
    return 'HTTP 429 (Rate Limit / Quota Exhausted)';
  }
  if (status === 503 || msg.includes('503') || msg.toLowerCase().includes('unavailable')) {
    return 'HTTP 503 (Service Unavailable)';
  }
  if (status === 500 || status === 502 || status === 504) {
    return `HTTP ${status} (Transient Gateway / Server Error)`;
  }
  return msg.slice(0, 60);
}

export class GeminiClient {
  private model: string;
  private maxRetriesPerKey: number;
  private initialBackoffMs: number;
  private backoffMultiplier: number;
  private cooldownMs: number;
  private logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  private governor: GeminiUsageGovernor;
  private customRunner?: (
    keyLabel: any,
    prompt: string,
    attempt: number
  ) => Promise<string>;

  private accounts: KeyAccount[] = [];
  private nextKeyIndex = 0;

  constructor(optionsOrModel?: string | GeminiClientOptions) {
    let keySlots: { key: string; projectId: string }[] = [];
    if (typeof optionsOrModel === 'string') {
      this.model = optionsOrModel;
      this.maxRetriesPerKey = 2; // 1 initial + 2 retries = 3 attempts
      this.initialBackoffMs = 500;
      this.backoffMultiplier = 2;
      this.cooldownMs = 60000;
      this.governor = getGlobalGovernor();
      keySlots = [
        { key: CONFIG.GEMINI_API_KEY, projectId: CONFIG.GEMINI_PROJECT_ID || 'project_slot_1' },
        { key: CONFIG.GEMINI_API_KEY_2, projectId: CONFIG.GEMINI_PROJECT_ID_2 || 'project_slot_2' },
        { key: CONFIG.GEMINI_API_KEY_3, projectId: CONFIG.GEMINI_PROJECT_ID_3 || 'project_slot_3' },
      ];
    } else {
      const opts = optionsOrModel || {};
      this.model = opts.model || CONFIG.GEMINI_MODEL;
      this.maxRetriesPerKey = typeof opts.maxRetriesPerKey === 'number' ? opts.maxRetriesPerKey : 2;
      this.initialBackoffMs = typeof opts.initialBackoffMs === 'number' ? opts.initialBackoffMs : 500;
      this.backoffMultiplier = typeof opts.backoffMultiplier === 'number' ? opts.backoffMultiplier : 2;
      this.cooldownMs = typeof opts.cooldownMs === 'number' ? opts.cooldownMs : 60000;
      this.logger = opts.logger;
      this.governor = opts.governor || getGlobalGovernor();
      this.customRunner = opts.customRunner;

      if (opts.keys && opts.keys.length > 0) {
        keySlots = opts.keys.map((k, idx) => ({
          key: k,
          projectId: `project_slot_${idx + 1}`,
        }));
      } else {
        keySlots = [
          {
            key: opts.primaryKey ?? CONFIG.GEMINI_API_KEY,
            projectId: opts.primaryProjectId || CONFIG.GEMINI_PROJECT_ID || 'project_slot_1',
          },
          {
            key: opts.secondaryKey ?? CONFIG.GEMINI_API_KEY_2,
            projectId: opts.secondaryProjectId || CONFIG.GEMINI_PROJECT_ID_2 || 'project_slot_2',
          },
          {
            key: opts.tertiaryKey ?? CONFIG.GEMINI_API_KEY_3,
            projectId: opts.tertiaryProjectId || CONFIG.GEMINI_PROJECT_ID_3 || 'project_slot_3',
          },
        ];
      }
    }

    // Initialize 3 Key Accounts for the router pool
    const slotNames = ['Gemini account slot 1', 'Gemini account slot 2', 'Gemini account slot 3'];
    const labels = ['PRIMARY', 'SECONDARY', 'TERTIARY'];

    keySlots.forEach((slot, idx) => {
      const slotName = slotNames[idx] || `Gemini account slot ${idx + 1}`;
      const hasKey = Boolean(slot.key && slot.key.trim().length > 0);

      // Safe logging without exposing secret values
      this.log(`${slotName}: ${hasKey ? 'configured' : 'not configured'}`);

      if (hasKey) {
        const id = `KEY_${idx + 1}`;
        const label = labels[idx] || `KEY_${idx + 1}`;
        let ai: GoogleGenAI | undefined;
        try {
          ai = new GoogleGenAI({
            apiKey: slot.key,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });
        } catch (err) {
          this.log(`[GEMINI POOL] Failed to initialize GoogleGenAI for ${label}: ${(err as Error).message}`);
        }

        this.accounts.push({
          id,
          label,
          slotName,
          apiKey: slot.key,
          projectId: slot.projectId,
          ai,
          cooldownUntil: 0,
          consecutiveFailures: 0,
          totalRequests: 0,
          totalSuccesses: 0,
        });
      }
    });

    // Check project-level quota sharing honesty
    if (this.accounts.length >= 2) {
      const projectIds = this.accounts.map((a) => a.projectId);
      const uniqueProjects = new Set(projectIds);
      if (uniqueProjects.size < this.accounts.length) {
        this.log(
          `[GEMINI POOL] Project quota notice: Multiple active accounts share the same Google Cloud project. Gemini quotas are enforced per-project; key rotation alleviates concurrency and per-key throttles, but does not multiply project-level limits.`
        );
      }
    }
  }

  getModel(): string {
    return this.model;
  }

  isAvailable(): boolean {
    return this.accounts.length > 0 || Boolean(this.customRunner);
  }

  hasSecondaryKey(): boolean {
    return this.accounts.length >= 2;
  }

  hasTertiaryKey(): boolean {
    return this.accounts.length >= 3;
  }

  getActiveKeyCount(): number {
    return this.accounts.length;
  }

  getPoolStatus(): {
    totalAccounts: number;
    healthyAccounts: number;
    cooldownAccounts: number;
    accounts: { id: string; label: string; healthy: boolean; cooldownRemainingMs: number }[];
  } {
    const now = Date.now();
    const accounts = this.accounts.map((acc) => {
      const healthy = acc.cooldownUntil <= now;
      const cooldownRemainingMs = healthy ? 0 : acc.cooldownUntil - now;
      return { id: acc.id, label: acc.label, healthy, cooldownRemainingMs };
    });

    return {
      totalAccounts: this.accounts.length,
      healthyAccounts: accounts.filter((a) => a.healthy).length,
      cooldownAccounts: accounts.filter((a) => !a.healthy).length,
      accounts,
    };
  }

  getGovernor(): GeminiUsageGovernor {
    return this.governor;
  }

  getActiveKeyIndex(): number {
    return this.nextKeyIndex;
  }

  getKeysRotatedCount(): number {
    const stats = this.governor.getStats();
    return Math.max(0, stats.keysUsed.length - 1);
  }

  getRotationContext(): { keysRotated: number; activeKeyIndex: number } {
    return {
      keysRotated: this.getKeysRotatedCount(),
      activeKeyIndex: this.getActiveKeyIndex(),
    };
  }

  /**
   * Executes a Gemini request with intelligent account pool rotation, rate-limit cooldown,
   * bounded exponential backoff, and transparent failover across up to 3 independent accounts.
   */
  async executeWithFailover(
    promptOrContents: GeminiContents,
    operation: GeminiOperationType = 'other'
  ): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('No Gemini API keys configured.');
    }

    // Check Gemini Usage Governor limit before making API request
    const governorCheck = this.governor.canMakeRequest(operation);
    if (!governorCheck.allowed) {
      this.log(`[GEMINI GOVERNOR] Request blocked for operation "${operation}": ${governorCheck.reason}`);
      throw new Error(`Gemini budget exhausted: ${governorCheck.reason}`);
    }

    if (this.customRunner) {
      // Mock runner execution for test environments
      return this.runWithCustomRunner(promptOrContents, operation);
    }

    const maxCycleRounds = 2; // Allow checking all accounts twice if cooldowns expire
    let cycle = 0;

    while (cycle < maxCycleRounds) {
      cycle++;
      const now = Date.now();

      // Find all accounts eligible to execute (cooldown expired)
      const eligibleAccounts = this.accounts.filter((acc) => acc.cooldownUntil <= now);

      if (eligibleAccounts.length === 0) {
        // All keys are currently in cooldown
        const earliestCooldown = Math.min(...this.accounts.map((a) => a.cooldownUntil));
        const waitMs = Math.max(100, earliestCooldown - now);

        if (waitMs <= 5000 && cycle === 1) {
          this.log(`[GEMINI POOL] All ${this.accounts.length} keys cooling down. Waiting ${(waitMs / 1000).toFixed(1)}s for earliest cooldown...`);
          await this.sleep(waitMs);
          continue;
        }

        this.governor.recordFallback('all_keys_cooldown');
        this.log(`[GEMINI POOL] All ${this.accounts.length} Gemini API keys are rate-limited or cooling down.`);
        throw new Error(`All ${this.accounts.length} configured Gemini API keys (GEMINI_API_KEY pool) failed or are exhausted.`);
      }

      // Rotate starting account index among eligible accounts to distribute load across accounts
      const startIndex = this.nextKeyIndex % eligibleAccounts.length;
      this.nextKeyIndex = (this.nextKeyIndex + 1) % Math.max(1, eligibleAccounts.length);

      const orderedAccounts = [
        ...eligibleAccounts.slice(startIndex),
        ...eligibleAccounts.slice(0, startIndex),
      ];

      for (const account of orderedAccounts) {
        let attempt = 0;
        const maxAttempts = this.maxRetriesPerKey + 1;

        while (attempt < maxAttempts) {
          attempt++;
          account.totalRequests++;

          try {
            this.log(`[GEMINI POOL] Dispatching request using ${account.label} (${account.id}, project: ${account.projectId}) [attempt ${attempt}/${maxAttempts}]`);
            const result = await this.callAiAccount(account, promptOrContents);

            account.consecutiveFailures = 0;
            account.totalSuccesses++;
            account.cooldownUntil = 0;

            // Record request in governor upon successful completion
            this.governor.recordRequest(operation, account.id, account.projectId);
            return result;
          } catch (err) {
            account.consecutiveFailures++;

            if (!isRetryableGeminiError(err)) {
              this.log(`[GEMINI POOL] Non-retryable error with ${account.label}: ${this.sanitize((err as Error).message)}`);
              throw err;
            }

            const reason = getSanitizedErrorReason(err);
            const isRateLimit = isRateLimitGeminiError(err);

            if (isRateLimit) {
              // Rate limit / 429 encountered: record in governor and apply temporary cooldown
              this.governor.record429(account.id, account.projectId);
              account.cooldownUntil = Date.now() + this.cooldownMs;
              this.log(`[GEMINI POOL] ${account.label} hit rate limit (${reason}). Entering ${this.cooldownMs / 1000}s cooldown. Rotating to next key in pool...`);

              // Honest project quota notice:
              const otherEligible = this.accounts.filter((a) => a.id !== account.id && a.cooldownUntil <= Date.now());
              const independentProjectAvailable = otherEligible.some((a) => a.projectId !== account.projectId);
              if (!independentProjectAvailable && otherEligible.length > 0) {
                this.log(`[GEMINI POOL] Notice: Remaining fallback accounts share Google Cloud project "${account.projectId}". Quotas are enforced at project level.`);
              }

              // Break inner retry loop to immediately failover to next key in pool
              break;
            }

            this.governor.recordRetry(account.id);
            this.log(`[GEMINI POOL] Transient error with ${account.label} (${reason})`);
            if (attempt < maxAttempts) {
              const delay = this.initialBackoffMs * Math.pow(this.backoffMultiplier, attempt - 1);
              this.log(`[GEMINI POOL] Retrying ${account.label} in ${delay}ms...`);
              await this.sleep(delay);
            } else {
              this.log(`[GEMINI POOL] Retries exhausted for ${account.label}. Rotating to next account in pool.`);
            }
          }
        }
      }
    }

    this.governor.recordFallback('quota_exhausted');
    throw new Error(
      `All ${this.accounts.length} configured Gemini API keys (GEMINI_API_KEY pool) failed and are exhausted.`
    );
  }

  /**
   * Generates JSON output with router failover, automatic schema guidance, and parsing.
   */
  async generateJson<T>(
    promptOrContents: GeminiContents,
    fallbackOrOptions?: (() => T) | { temperature?: number; maxOutputTokens?: number; operation?: GeminiOperationType },
    opArg?: GeminiOperationType
  ): Promise<T> {
    let fallbackGenerator: (() => T) | undefined;
    let operation: GeminiOperationType = opArg || 'other';

    if (typeof fallbackOrOptions === 'function') {
      fallbackGenerator = fallbackOrOptions;
    } else if (fallbackOrOptions && typeof fallbackOrOptions === 'object') {
      if (fallbackOrOptions.operation) {
        operation = fallbackOrOptions.operation;
      }
    }

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

        const text = await this.executeWithFailover(contentsToExecute, operation);

        const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
        return JSON.parse(cleaned) as T;
      } catch (err) {
        const errMsg = (err as Error).message || '';

        // If error is exhaustion of keys or governor budget limit, handle gracefully according to policy
        if (errMsg.includes('exhausted') || errMsg.includes('budget exhausted')) {
          if (fallbackGenerator && CONFIG.ALLOW_FALLBACKS) {
            this.governor.recordFallback('quota_exhausted');
            return fallbackGenerator();
          }
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

  private async callAiAccount(account: KeyAccount, promptOrContents: GeminiContents): Promise<string> {
    if (!account.ai) {
      throw new Error(`AI instance for ${account.label} is not initialized.`);
    }

    let contentsPayload: any;
    if (typeof promptOrContents === 'string') {
      contentsPayload = promptOrContents;
    } else if (Array.isArray(promptOrContents)) {
      contentsPayload = { parts: promptOrContents };
    } else {
      contentsPayload = promptOrContents;
    }

    const response = await account.ai.models.generateContent({
      model: this.model,
      contents: contentsPayload,
    });

    return response.text || '';
  }

  private async runWithCustomRunner(
    promptOrContents: GeminiContents,
    operation: GeminiOperationType = 'other'
  ): Promise<string> {
    const runner = this.customRunner!;
    const labels = ['PRIMARY', 'SECONDARY', 'TERTIARY'];
    let lastErr: any;

    for (let i = 0; i < Math.max(1, this.accounts.length || 2); i++) {
      const label = labels[i] || `KEY_${i + 1}`;
      const accountId = `KEY_${i + 1}`;
      const projectId = this.accounts[i]?.projectId || `project_slot_${i + 1}`;
      try {
        const text = await runner(label, promptOrContents as any, 1);
        this.governor.recordRequest(operation, accountId, projectId);
        return text;
      } catch (err) {
        lastErr = err;
        if (isRateLimitGeminiError(err)) {
          this.governor.record429(accountId, projectId);
        }
        if (!isRetryableGeminiError(err)) {
          throw err;
        }
      }
    }

    this.governor.recordFallback('all_keys_cooldown');
    throw lastErr || new Error('All custom runners failed');
  }

  private sanitize(text: string): string {
    let result = text;
    for (const acc of this.accounts) {
      if (acc.apiKey) {
        result = result.split(acc.apiKey).join(`[REDACTED_${acc.id}]`);
      }
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
