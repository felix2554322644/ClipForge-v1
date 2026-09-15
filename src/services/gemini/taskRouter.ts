import { GeminiOperationType } from '../governor/usageGovernor';

export type GeminiTaskType =
  // Key 1 primary responsibilities
  | 'topic'
  | 'topic_generation'
  | 'topic_resolution'
  | 'research'
  | 'factual_extraction'
  | 'fact_checking'
  | 'research_refinement'
  // Key 2 primary responsibilities
  | 'story'
  | 'story_generation'
  | 'script'
  | 'scripting'
  | 'script_generation'
  | 'hooks'
  | 'narrative_structure'
  | 'storyboard'
  | 'visual_intent'
  | 'director'
  | 'director_decision'
  | 'director_refinement'
  | 'retention'
  // Key 3 primary responsibilities
  | 'candidate_eval'
  | 'multimodal_eval'
  | 'broll_inspection'
  | 'visual_relevance'
  | 'visual_grounding'
  | 'visual_continuity'
  | 'stock_vs_custom'
  | 'qc'
  | 'qc_review'
  | 'final_qc'
  | 'other';

export interface KeyWorkloadMetrics {
  id: string; // 'KEY_1', 'KEY_2', 'KEY_3'
  slotIndex: number; // 0, 1, 2
  label: string;
  roleName: string;
  configured: boolean;
  projectId: string;
  requestCount: number;
  estimatedTokenUsage: number;
  multimodalWorkload: number;
  failures: number;
  consecutiveFailures: number;
  rateLimit429Count: number;
  cooldownUntil: number;
  primaryTasks: string[];
  handledTasks: Record<string, number>;
}

export interface TaskRouteDecision {
  selectedSlotIndex: number;
  selectedKeyId: string;
  isPreferredKey: boolean;
  isFallback: boolean;
  reason: string;
  workloadScore: number;
}

export class GeminiTaskRouter {
  private metrics: KeyWorkloadMetrics[];
  private cooldownMs: number;
  private logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

  constructor(options: {
    slotsConfigured: { slot: number; id: string; configured: boolean; projectId: string }[];
    cooldownMs?: number;
    logger?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  }) {
    this.cooldownMs = options.cooldownMs || 60000;
    this.logger = options.logger;

    const roleNames = [
      'PRIMARY (Topic / Research / Factual Extraction)',
      'SECONDARY (Story / Script / Storyboard / Retention)',
      'TERTIARY (Multimodal B-roll / Continuity / Visual QC)',
    ];

    const primaryTasksBySlot = [
      ['topic', 'research', 'factual_extraction', 'fact_checking', 'research_refinement'],
      ['story', 'script', 'hooks', 'narrative_structure', 'storyboard', 'visual_intent', 'director_decision', 'director_refinement', 'retention'],
      ['candidate_eval', 'multimodal_eval', 'broll_inspection', 'visual_relevance', 'visual_grounding', 'visual_continuity', 'stock_vs_custom', 'qc_review', 'final_qc'],
    ];

    this.metrics = [0, 1, 2].map((slotIdx) => {
      const cfg = options.slotsConfigured.find((s) => s.slot === slotIdx + 1) || {
        slot: slotIdx + 1,
        id: `KEY_${slotIdx + 1}`,
        configured: false,
        projectId: `project_${slotIdx + 1}`,
      };

      return {
        id: `KEY_${slotIdx + 1}`,
        slotIndex: slotIdx,
        label: `Key ${slotIdx + 1}`,
        roleName: roleNames[slotIdx],
        configured: cfg.configured,
        projectId: cfg.projectId,
        requestCount: 0,
        estimatedTokenUsage: 0,
        multimodalWorkload: 0,
        failures: 0,
        consecutiveFailures: 0,
        rateLimit429Count: 0,
        cooldownUntil: 0,
        primaryTasks: primaryTasksBySlot[slotIdx],
        handledTasks: {},
      };
    });
  }

  /**
   * Identifies the primary preferred key slot (0, 1, or 2) for a given task.
   */
  public getPreferredSlotForTask(task: string): number {
    const t = task.toLowerCase();

    // Key 1: Topic, Research, Factual
    if (
      t.includes('topic') ||
      t.includes('research') ||
      t.includes('factual') ||
      t.includes('fact_check')
    ) {
      return 0;
    }

    // Key 2: Story, Script, Storyboard, Editorial, Retention
    if (
      t.includes('story') ||
      t.includes('script') ||
      t.includes('hook') ||
      t.includes('narrative') ||
      t.includes('director') ||
      t.includes('editorial') ||
      t.includes('retention')
    ) {
      return 1;
    }

    // Key 3: Multimodal, B-roll inspection, Visual grounding, QC
    if (
      t.includes('candidate') ||
      t.includes('multimodal') ||
      t.includes('broll') ||
      t.includes('grounding') ||
      t.includes('continuity') ||
      t.includes('stock_vs_custom') ||
      t.includes('qc') ||
      t.includes('inspect')
    ) {
      return 2;
    }

    return 0; // Default to Key 1
  }

  /**
   * Calculates a composite workload score for a key. Lower score = less loaded.
   */
  public calculateWorkloadScore(slotIndex: number): number {
    const m = this.metrics[slotIndex];
    if (!m) return Infinity;

    // Weight: 1 per standard request, 3 per multimodal evaluation, plus token factor
    const tokenFactor = Math.round(m.estimatedTokenUsage / 1000);
    const failurePenalty = m.consecutiveFailures * 10;
    return m.requestCount * 1.5 + m.multimodalWorkload * 3.0 + tokenFactor + failurePenalty;
  }

  /**
   * Checks if an account is healthy and ready to process requests.
   */
  public isSlotHealthy(slotIndex: number): boolean {
    const m = this.metrics[slotIndex];
    if (!m || !m.configured) return false;
    const now = Date.now();
    return m.cooldownUntil <= now && m.consecutiveFailures < 3;
  }

  public isSlotCoolingDown(slotIndex: number): boolean {
    const m = this.metrics[slotIndex];
    if (!m) return false;
    return m.cooldownUntil > Date.now();
  }

  /**
   * Selects the optimal key slot for a task based on task affinity, health,
   * 429 cooldown status, and current workload (avoiding dumb round-robin).
   */
  public routeTask(task: string, isMultimodal = false): TaskRouteDecision {
    const preferredSlot = this.getPreferredSlotForTask(task);
    const now = Date.now();

    // 1. Check if preferred slot is configured and healthy
    if (this.isSlotHealthy(preferredSlot)) {
      const score = this.calculateWorkloadScore(preferredSlot);
      return {
        selectedSlotIndex: preferredSlot,
        selectedKeyId: this.metrics[preferredSlot].id,
        isPreferredKey: true,
        isFallback: false,
        reason: `Routed to primary key for ${task} (${this.metrics[preferredSlot].roleName})`,
        workloadScore: score,
      };
    }

    // 2. Preferred key unavailable: find all configured and healthy fallback candidates
    const eligibleSlots: number[] = [];
    for (let i = 0; i < this.metrics.length; i++) {
      if (this.isSlotHealthy(i)) {
        eligibleSlots.push(i);
      }
    }

    if (eligibleSlots.length > 0) {
      // Sort eligible keys by workload score ascending (lowest workload first)
      eligibleSlots.sort((a, b) => this.calculateWorkloadScore(a) - this.calculateWorkloadScore(b));
      const chosenSlot = eligibleSlots[0];
      const preferredM = this.metrics[preferredSlot];
      const reasonPrefix = !preferredM.configured
        ? `Primary KEY_${preferredSlot + 1} not configured`
        : preferredM.cooldownUntil > now
        ? `Primary KEY_${preferredSlot + 1} cooling down (${Math.round((preferredM.cooldownUntil - now) / 1000)}s remaining)`
        : `Primary KEY_${preferredSlot + 1} has ${preferredM.consecutiveFailures} consecutive failures`;

      const chosenScore = this.calculateWorkloadScore(chosenSlot);
      return {
        selectedSlotIndex: chosenSlot,
        selectedKeyId: this.metrics[chosenSlot].id,
        isPreferredKey: false,
        isFallback: true,
        reason: `${reasonPrefix}; failover routed to lowest workload healthy key KEY_${chosenSlot + 1} (workload: ${chosenScore.toFixed(1)})`,
        workloadScore: chosenScore,
      };
    }

    // 3. All configured keys are either unconfigured or in cooldown
    // If any configured key has cooldown expiring soon, pick the earliest
    const configuredSlots = this.metrics.filter((m) => m.configured);
    if (configuredSlots.length === 0) {
      return {
        selectedSlotIndex: 0,
        selectedKeyId: 'KEY_1',
        isPreferredKey: false,
        isFallback: true,
        reason: 'No Gemini API keys configured',
        workloadScore: Infinity,
      };
    }

    const earliest = configuredSlots.reduce((prev, curr) =>
      curr.cooldownUntil < prev.cooldownUntil ? curr : prev
    );

    return {
      selectedSlotIndex: earliest.slotIndex,
      selectedKeyId: earliest.id,
      isPreferredKey: earliest.slotIndex === preferredSlot,
      isFallback: earliest.slotIndex !== preferredSlot,
      reason: `All keys in cooldown; earliest available is KEY_${earliest.slotIndex + 1} in ${Math.max(0, Math.round((earliest.cooldownUntil - now) / 1000))}s`,
      workloadScore: this.calculateWorkloadScore(earliest.slotIndex),
    };
  }

  /**
   * Records successful task execution for an account.
   */
  public recordSuccess(
    slotIndex: number,
    task: string,
    isMultimodal = false,
    estimatedTokens = 500
  ): void {
    const m = this.metrics[slotIndex];
    if (!m) return;

    m.requestCount++;
    m.estimatedTokenUsage += estimatedTokens;
    if (isMultimodal) {
      m.multimodalWorkload++;
    }
    m.consecutiveFailures = 0;
    m.cooldownUntil = 0;
    m.handledTasks[task] = (m.handledTasks[task] || 0) + 1;
  }

  /**
   * Records a 429 rate-limit error and puts the key into cooldown.
   */
  public record429(slotIndex: number, customCooldownMs?: number): void {
    const m = this.metrics[slotIndex];
    if (!m) return;

    const cooldown = customCooldownMs || this.cooldownMs;
    m.rateLimit429Count++;
    m.failures++;
    m.consecutiveFailures++;
    m.cooldownUntil = Date.now() + cooldown;
    this.logger?.warn(
      `[GEMINI ROUTER] ${m.id} (${m.label}) received 429 rate-limit. Placed in cooldown for ${cooldown / 1000}s.`
    );
  }

  /**
   * Records a transient non-429 error.
   */
  public recordFailure(slotIndex: number): void {
    const m = this.metrics[slotIndex];
    if (!m) return;
    m.failures++;
    m.consecutiveFailures++;
  }

  /**
   * Updates configured status dynamically.
   */
  public setSlotConfigured(slotIndex: number, configured: boolean, projectId?: string): void {
    const m = this.metrics[slotIndex];
    if (!m) return;
    m.configured = configured;
    if (projectId) m.projectId = projectId;
  }

  public getMetrics(): KeyWorkloadMetrics[] {
    return [...this.metrics];
  }

  /**
   * Generates a formatted end-of-run routing summary report.
   */
  public generateReport(): string {
    const lines: string[] = [
      '================================================================================',
      '                     GEMINI 3-KEY TASK ROUTING REPORT                           ',
      '================================================================================',
    ];

    this.metrics.forEach((m) => {
      const taskBreakdown = Object.entries(m.handledTasks)
        .map(([t, count]) => `${t}: ${count}`)
        .join(', ');

      lines.push(
        `${m.id} (${m.roleName}):`
      );
      lines.push(`  - Configured: ${m.configured ? 'YES' : 'NO'}`);
      lines.push(
        `  - Total Requests: ${m.requestCount} (Success: ${m.requestCount}) | Multimodal Workload: ${m.multimodalWorkload} | Tokens: ~${m.estimatedTokenUsage}`
      );
      lines.push(
        `  - Failures: ${m.failures} | Rate Limits (429): ${m.rateLimit429Count} | Health: ${this.isSlotHealthy(m.slotIndex) ? 'HEALTHY' : 'COOLDOWN'}`
      );
      lines.push(`  - Tasks Handled: ${taskBreakdown || 'none'}`);
    });

    lines.push('================================================================================');
    return lines.join('\n');
  }
}
