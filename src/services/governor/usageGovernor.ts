import { CONFIG } from '../../config/index';
import { PipelineLogger } from '../logging/logger';

export type GeminiOperationType =
  | 'topic'
  | 'topic_resolution'
  | 'research'
  | 'script'
  | 'scripting'
  | 'storyboard'
  | 'candidate_eval'
  | 'director'
  | 'director_decision'
  | 'director_refinement'
  | 'refinement'
  | 'qc'
  | 'qc_review'
  | 'other';

export type FallbackReasonType =
  | 'quota_exhausted'
  | 'request_budget_exhausted'
  | 'all_keys_cooldown'
  | 'temporary_api_failure'
  | null;

export type QCStatusType =
  | 'evaluated'
  | 'skipped_rate_limit'
  | 'deterministic_fallback'
  | 'not_run';

export interface GeminiGovernorLimits {
  maxGeminiRequests: number;
  maxSearchRounds: number;
  maxCandidatesTotal: number;
  maxCandidatesPerSearch: number;
  maxCandidateEvaluations: number;
  maxDirectorCalls: number;
  maxQcCalls: number;
}

export interface GeminiGovernorStats {
  totalRequests: number;
  requestsByOperation: Record<string, number>;
  searchRounds: number;
  candidatesRetrieved: number;
  candidateEvaluations: number;
  directorCalls: number;
  refinementCalls: number;
  qcCalls: number;
  rateLimit429Count: number;
  retryCount: number;
  keysUsed: string[];
  projectsUsed: string[];
  tokensEstimated: {
    input: number;
    output: number;
  };
  fallbackOccurred: boolean;
  fallbackReason: FallbackReasonType;
  qcStatus: QCStatusType;
}

export interface GeminiUsageReport {
  limits: GeminiGovernorLimits;
  stats: GeminiGovernorStats;
  summary: string;
  timestamp: string;
}

export class GeminiUsageGovernor {
  private limits: GeminiGovernorLimits;
  private totalRequests = 0;
  private requestsByOperation: Record<string, number> = {
    research: 0,
    scripting: 0,
    storyboard: 0,
    candidate_eval: 0,
    director: 0,
    refinement: 0,
    qc: 0,
    other: 0,
  };
  private searchRounds = 0;
  private candidatesRetrieved = 0;
  private candidateEvaluations = 0;
  private directorCalls = 0;
  private refinementCalls = 0;
  private qcCalls = 0;
  private rateLimit429Count = 0;
  private retryCount = 0;
  private keysUsedSet = new Set<string>();
  private projectsUsedSet = new Set<string>();
  private evaluatedCandidateIds = new Set<string>();
  private estimatedInputTokens = 0;
  private estimatedOutputTokens = 0;
  private fallbackOccurred = false;
  private fallbackReason: FallbackReasonType = null;
  private qcStatus: QCStatusType = 'not_run';

  constructor(
    customLimits: Partial<GeminiGovernorLimits> = {},
    private logger?: PipelineLogger
  ) {
    this.limits = {
      maxGeminiRequests:
        typeof customLimits.maxGeminiRequests === 'number'
          ? customLimits.maxGeminiRequests
          : CONFIG.CLIPFORGE_MAX_GEMINI_REQUESTS,
      maxSearchRounds:
        typeof customLimits.maxSearchRounds === 'number'
          ? customLimits.maxSearchRounds
          : CONFIG.CLIPFORGE_MAX_SEARCH_ROUNDS,
      maxCandidatesTotal:
        typeof customLimits.maxCandidatesTotal === 'number'
          ? customLimits.maxCandidatesTotal
          : CONFIG.CLIPFORGE_MAX_CANDIDATES_TOTAL,
      maxCandidatesPerSearch:
        typeof customLimits.maxCandidatesPerSearch === 'number'
          ? customLimits.maxCandidatesPerSearch
          : CONFIG.CLIPFORGE_MAX_CANDIDATES_PER_SEARCH,
      maxCandidateEvaluations:
        typeof customLimits.maxCandidateEvaluations === 'number'
          ? customLimits.maxCandidateEvaluations
          : CONFIG.CLIPFORGE_MAX_CANDIDATE_EVALUATIONS,
      maxDirectorCalls:
        typeof customLimits.maxDirectorCalls === 'number'
          ? customLimits.maxDirectorCalls
          : CONFIG.CLIPFORGE_MAX_DIRECTOR_CALLS,
      maxQcCalls:
        typeof customLimits.maxQcCalls === 'number'
          ? customLimits.maxQcCalls
          : CONFIG.CLIPFORGE_MAX_QC_CALLS,
    };
  }

  getLimits(): GeminiGovernorLimits {
    return { ...this.limits };
  }

  /**
   * Resets usage counters for a new production run.
   */
  reset(): void {
    this.totalRequests = 0;
    this.requestsByOperation = {
      research: 0,
      scripting: 0,
      storyboard: 0,
      candidate_eval: 0,
      director: 0,
      refinement: 0,
      qc: 0,
      other: 0,
    };
    this.searchRounds = 0;
    this.candidatesRetrieved = 0;
    this.candidateEvaluations = 0;
    this.directorCalls = 0;
    this.refinementCalls = 0;
    this.qcCalls = 0;
    this.rateLimit429Count = 0;
    this.retryCount = 0;
    this.keysUsedSet.clear();
    this.projectsUsedSet.clear();
    this.evaluatedCandidateIds.clear();
    this.estimatedInputTokens = 0;
    this.estimatedOutputTokens = 0;
    this.fallbackOccurred = false;
    this.fallbackReason = null;
    this.qcStatus = 'not_run';
  }

  /**
   * Evaluates whether a prospective Gemini call is permitted under the centralized budget.
   */
  canMakeRequest(operation: GeminiOperationType): { allowed: boolean; reason?: string } {
    // 1. Check Global Request Budget
    if (this.totalRequests >= this.limits.maxGeminiRequests) {
      this.recordFallback('request_budget_exhausted');
      return {
        allowed: false,
        reason: `Global Gemini request budget exhausted (${this.totalRequests}/${this.limits.maxGeminiRequests} requests used).`,
      };
    }

    // 2. Check Operation-Specific Budgets
    const isDirectorOp =
      operation === 'director' ||
      operation === 'director_decision' ||
      operation === 'director_refinement' ||
      operation === 'refinement';

    if (isDirectorOp) {
      if (this.directorCalls >= this.limits.maxDirectorCalls) {
        return {
          allowed: false,
          reason: `Director call limit reached (${this.directorCalls}/${this.limits.maxDirectorCalls}).`,
        };
      }
    }

    const isQcOp = operation === 'qc' || operation === 'qc_review';
    if (isQcOp) {
      if (this.qcCalls >= this.limits.maxQcCalls) {
        return {
          allowed: false,
          reason: `QC call limit reached (${this.qcCalls}/${this.limits.maxQcCalls}).`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Records a successfully initiated or dispatched Gemini request.
   */
  recordRequest(
    operation: GeminiOperationType,
    keyIdentifier?: string,
    projectIdentifier?: string,
    tokens?: { input?: number; output?: number }
  ): void {
    this.totalRequests++;
    this.requestsByOperation[operation] = (this.requestsByOperation[operation] || 0) + 1;

    const isDirectorOp =
      operation === 'director' ||
      operation === 'director_decision' ||
      operation === 'director_refinement' ||
      operation === 'refinement';

    if (isDirectorOp) {
      this.directorCalls++;
      if (operation === 'refinement' || operation === 'director_refinement') {
        this.refinementCalls++;
      }
    } else if (operation === 'qc' || operation === 'qc_review') {
      this.qcCalls++;
      this.qcStatus = 'evaluated';
    }

    if (keyIdentifier) {
      this.keysUsedSet.add(keyIdentifier);
    }
    if (projectIdentifier) {
      this.projectsUsedSet.add(projectIdentifier);
    }

    if (tokens?.input) this.estimatedInputTokens += tokens.input;
    if (tokens?.output) this.estimatedOutputTokens += tokens.output;

    this.logger?.info?.(
      `[GOVERNOR] Request recorded: op=${operation}, total=${this.totalRequests}/${this.limits.maxGeminiRequests}, key=${keyIdentifier || 'default'}`
    );
  }

  /**
   * Verifies if another candidate search round can be executed.
   */
  canSearchAgain(): boolean {
    return this.searchRounds < this.limits.maxSearchRounds &&
      this.candidatesRetrieved < this.limits.maxCandidatesTotal;
  }

  /**
   * Records the start of a candidate search round and returns the maximum candidates permitted for this round.
   */
  recordSearchRound(): { allowed: boolean; maxAllowedThisRound: number; roundNumber: number } {
    if (this.searchRounds >= this.limits.maxSearchRounds) {
      return { allowed: false, maxAllowedThisRound: 0, roundNumber: this.searchRounds };
    }

    this.searchRounds++;
    const remainingTotalQuota = Math.max(0, this.limits.maxCandidatesTotal - this.candidatesRetrieved);
    const maxAllowedThisRound = Math.min(this.limits.maxCandidatesPerSearch, remainingTotalQuota);

    this.logger?.info?.(
      `[GOVERNOR] Search round ${this.searchRounds}/${this.limits.maxSearchRounds} initiated. Quota for this round: ${maxAllowedThisRound} candidates (Total cap: ${this.limits.maxCandidatesTotal})`
    );

    return { allowed: true, maxAllowedThisRound, roundNumber: this.searchRounds };
  }

  /**
   * Records candidates retrieved during acquisition.
   */
  recordCandidatesRetrieved(count: number): number {
    const before = this.candidatesRetrieved;
    this.candidatesRetrieved = Math.min(this.limits.maxCandidatesTotal, this.candidatesRetrieved + count);
    const added = this.candidatesRetrieved - before;
    this.logger?.info?.(
      `[GOVERNOR] Candidates registered: +${added} (Total: ${this.candidatesRetrieved}/${this.limits.maxCandidatesTotal})`
    );
    return this.candidatesRetrieved;
  }

  /**
   * Evaluates if a candidate can be evaluated multimodally.
   * Returns false if evaluation quota reached or if asset was already evaluated.
   */
  canEvaluateCandidate(assetId: string): boolean {
    if (this.evaluatedCandidateIds.has(assetId)) {
      return false; // Already evaluated in this run
    }
    return this.candidateEvaluations < this.limits.maxCandidateEvaluations;
  }

  /**
   * Has this candidate already been evaluated in this run?
   */
  hasCandidateBeenEvaluated(assetId: string): boolean {
    return this.evaluatedCandidateIds.has(assetId);
  }

  /**
   * Records a candidate multimodal evaluation.
   */
  recordCandidateEvaluation(assetId: string): boolean {
    if (this.evaluatedCandidateIds.has(assetId)) {
      return false; // Already evaluated, prevent duplicate counting
    }
    if (this.candidateEvaluations >= this.limits.maxCandidateEvaluations) {
      return false;
    }

    this.evaluatedCandidateIds.add(assetId);
    this.candidateEvaluations++;
    return true;
  }

  canCallDirector(): boolean {
    return this.directorCalls < this.limits.maxDirectorCalls &&
      this.totalRequests < this.limits.maxGeminiRequests;
  }

  canCallQc(): boolean {
    return this.qcCalls < this.limits.maxQcCalls &&
      this.totalRequests < this.limits.maxGeminiRequests;
  }

  record429(keyIdentifier?: string, projectIdentifier?: string): void {
    this.rateLimit429Count++;
    if (keyIdentifier) {
      this.keysUsedSet.add(keyIdentifier);
    }
    if (projectIdentifier) {
      this.projectsUsedSet.add(projectIdentifier);
    }
    this.logger?.warn?.(
      `[GOVERNOR] 429 recorded (Total 429s: ${this.rateLimit429Count}) on ${keyIdentifier || 'account'}`
    );
  }

  recordRetry(keyIdentifier?: string): void {
    this.retryCount++;
    if (keyIdentifier) {
      this.keysUsedSet.add(keyIdentifier);
    }
  }

  recordFallback(reason: FallbackReasonType): void {
    this.fallbackOccurred = true;
    if (!this.fallbackReason) {
      this.fallbackReason = reason;
    }
    this.logger?.warn?.(`[GOVERNOR] Fallback triggered. Reason: ${reason}`);
  }

  recordQcStatus(status: QCStatusType): void {
    this.qcStatus = status;
  }

  getStats(): GeminiGovernorStats {
    return {
      totalRequests: this.totalRequests,
      requestsByOperation: { ...this.requestsByOperation },
      searchRounds: this.searchRounds,
      candidatesRetrieved: this.candidatesRetrieved,
      candidateEvaluations: this.candidateEvaluations,
      directorCalls: this.directorCalls,
      refinementCalls: this.refinementCalls,
      qcCalls: this.qcCalls,
      rateLimit429Count: this.rateLimit429Count,
      retryCount: this.retryCount,
      keysUsed: Array.from(this.keysUsedSet),
      projectsUsed: Array.from(this.projectsUsedSet),
      tokensEstimated: {
        input: this.estimatedInputTokens,
        output: this.estimatedOutputTokens,
      },
      fallbackOccurred: this.fallbackOccurred,
      fallbackReason: this.fallbackReason,
      qcStatus: this.qcStatus,
    };
  }

  /**
   * Generates the required compact end-of-run log summary:
   *
   * Gemini Usage:
   * requests: X / 12
   * search rounds: X / 2
   * candidates retrieved: X / 20
   * candidate evaluations: X / 12
   * director calls: X / 2
   * QC calls: X / 1
   * 429s: X
   * keys used: X
   * fallback: yes/no
   */
  /**
   * Generates the end-of-run usage summary report matching the required specification:
   *
   * --- CLIPFORGE GEMINI USAGE REPORT ---
   * Total Gemini requests: X / 12
   * Requests by operation:
   * - topic: X
   * - research: X
   * - script: X
   * - storyboard: X
   * - director: X
   * - qc: X
   * Candidate search rounds: X / 2
   * Candidates retrieved: X / 20
   * Candidates evaluated: X / 12
   * Keys rotated: X
   * Active key index: X
   * Project ID(s) used: [...]
   * Status: WITHIN_BUDGET | BUDGET_EXCEEDED
   * -------------------------------------
   */
  generateReportString(rotationContext?: { keysRotated?: number; activeKeyIndex?: number }): string {
    const isBudgetExceeded =
      this.totalRequests > this.limits.maxGeminiRequests ||
      this.searchRounds > this.limits.maxSearchRounds ||
      this.candidatesRetrieved > this.limits.maxCandidatesTotal ||
      this.candidateEvaluations > this.limits.maxCandidateEvaluations ||
      this.directorCalls > this.limits.maxDirectorCalls ||
      this.qcCalls > this.limits.maxQcCalls;

    const status = isBudgetExceeded ? 'BUDGET_EXCEEDED' : 'WITHIN_BUDGET';

    const topicCount =
      (this.requestsByOperation['topic'] || 0) + (this.requestsByOperation['topic_resolution'] || 0);
    const researchCount = this.requestsByOperation['research'] || 0;
    const scriptCount =
      (this.requestsByOperation['script'] || 0) + (this.requestsByOperation['scripting'] || 0);
    const storyboardCount = this.requestsByOperation['storyboard'] || 0;
    const directorCount =
      (this.requestsByOperation['director'] || 0) +
      (this.requestsByOperation['director_decision'] || 0) +
      (this.requestsByOperation['director_refinement'] || 0) +
      (this.requestsByOperation['refinement'] || 0);
    const qcCount =
      (this.requestsByOperation['qc'] || 0) + (this.requestsByOperation['qc_review'] || 0);

    const keysRotated = rotationContext?.keysRotated ?? Math.max(0, this.keysUsedSet.size - 1);
    const activeKeyIdx = rotationContext?.activeKeyIndex ?? 0;
    const projectsUsed = Array.from(this.projectsUsedSet).map((p) => p.trim()).filter(Boolean);
    const projectsDisplay = projectsUsed.length > 0 ? `[${projectsUsed.join(', ')}]` : '[]';

    return [
      '--- CLIPFORGE GEMINI USAGE REPORT ---',
      `Total Gemini requests: ${this.totalRequests} / ${this.limits.maxGeminiRequests}`,
      'Requests by operation:',
      `- topic: ${topicCount}`,
      `- research: ${researchCount}`,
      `- script: ${scriptCount}`,
      `- storyboard: ${storyboardCount}`,
      `- director: ${directorCount}`,
      `- qc: ${qcCount}`,
      `Candidate search rounds: ${this.searchRounds} / ${this.limits.maxSearchRounds}`,
      `Candidates retrieved: ${this.candidatesRetrieved} / ${this.limits.maxCandidatesTotal}`,
      `Candidates evaluated: ${this.candidateEvaluations} / ${this.limits.maxCandidateEvaluations}`,
      `Keys rotated: ${keysRotated}`,
      `Active key index: ${activeKeyIdx}`,
      `Project ID(s) used: ${projectsDisplay}`,
      `Status: ${status}`,
      '-------------------------------------',
    ].join('\n');
  }

  formatCompactSummary(): string {
    const keysCount = Math.max(this.keysUsedSet.size, this.totalRequests > 0 ? 1 : 0);
    const fallbackText = this.fallbackOccurred ? 'yes' : 'no';

    return [
      'Gemini Usage:',
      `requests: ${this.totalRequests} / ${this.limits.maxGeminiRequests}`,
      `search rounds: ${this.searchRounds} / ${this.limits.maxSearchRounds}`,
      `candidates retrieved: ${this.candidatesRetrieved} / ${this.limits.maxCandidatesTotal}`,
      `candidate evaluations: ${this.candidateEvaluations} / ${this.limits.maxCandidateEvaluations}`,
      `director calls: ${this.directorCalls} / ${this.limits.maxDirectorCalls}`,
      `QC calls: ${this.qcCalls} / ${this.limits.maxQcCalls}`,
      `429s: ${this.rateLimit429Count}`,
      `keys used: ${keysCount}`,
      `fallback: ${fallbackText}`,
    ].join('\n');
  }

  getSummaryReport(): GeminiUsageReport {
    return {
      limits: this.getLimits(),
      stats: this.getStats(),
      summary: this.formatCompactSummary(),
      timestamp: new Date().toISOString(),
    };
  }
}

// Global default governor instance
let globalGovernor: GeminiUsageGovernor | null = null;

export function getGlobalGovernor(): GeminiUsageGovernor {
  if (!globalGovernor) {
    globalGovernor = new GeminiUsageGovernor();
  }
  return globalGovernor;
}

export function setGlobalGovernor(governor: GeminiUsageGovernor): void {
  globalGovernor = governor;
}
