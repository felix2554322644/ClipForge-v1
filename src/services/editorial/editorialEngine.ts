import {
  CaptionSegment,
  EditorialDecision,
  EditorialMotion,
  EditorialPlan,
  EditorialRole,
  EditorialTransition,
  PatternInterrupt,
  ResearchBrief,
  ScenePlanOutput,
  ScriptOutput,
  SelectedBrollScene,
} from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';

export interface EditorialEngineInput {
  scenePlan: ScenePlanOutput;
  brollSelections: SelectedBrollScene[];
  script: ScriptOutput;
  totalDurationSeconds: number;
  researchBrief?: ResearchBrief;
  captions?: CaptionSegment[];
}

export class EditorialEngine {
  constructor(private logger?: PipelineLogger) {}

  /**
   * Evaluates script, narration timing, B-roll, and caption data to generate
   * a retention-optimized editorial plan prior to timeline compilation.
   */
  makeEditorialDecisions(input: EditorialEngineInput): EditorialPlan {
    this.logger?.stage(
      'EDITORIAL_DECISION',
      `Evaluating editorial pacing, variety, and retention strategies for ${input.scenePlan.scenes.length} scenes (${input.totalDurationSeconds.toFixed(2)}s)`
    );

    // 1. Gather all raw shots from scene plan
    const rawShots = this.extractRawShots(input.scenePlan);

    if (rawShots.length === 0) {
      throw new Error('Scene plan contains no shots for editorial processing');
    }

    // 2. Classify editorial role for every shot
    const classifiedRoles = rawShots.map((shot, idx) =>
      this.classifyShotRole(shot.narrationClause, idx, rawShots.length, input.researchBrief)
    );

    // 3. Calculate retention-aware pacing weights and allocated durations
    const durations = this.calculatePacingDurations(
      rawShots,
      classifiedRoles,
      input.totalDurationSeconds
    );

    // 4. Track used source clip intervals to guarantee non-overlapping B-roll reuse
    const clipIntervals = new Map<string, { start: number; end: number }[]>();

    // 5. Variety history buffers to enforce anti-repetition
    const motionHistory: EditorialMotion[] = [];
    let lastTransition: EditorialTransition = 'cut';
    let lastInterruptTime = -999;
    let patternInterruptCount = 0;
    let staticHoldsCount = 0;

    let cumulativeTime = 0;
    const decisions: EditorialDecision[] = [];

    for (let i = 0; i < rawShots.length; i++) {
      const shot = rawShots[i];
      const role = classifiedRoles[i];
      const durationSeconds = durations[i];
      const isHook = i === 0;
      const isClimax = role === 'payoff' || (i === rawShots.length - 2 && rawShots.length > 3);
      const isConclusion = i === rawShots.length - 1;

      // Match selected B-roll candidate
      const brollMatch =
        input.brollSelections.find((b) => b.shotId === shot.id) ||
        input.brollSelections.find(
          (b) => b.sceneIndex === shot.sceneIndex && b.shotIndex === shot.shotIndex
        ) ||
        input.brollSelections[i] ||
        input.brollSelections[0];

      const videoSourcePath =
        brollMatch?.reframedPath || brollMatch?.broll?.videoPath || '';
      const sourceDuration = brollMatch?.broll?.durationSeconds || durationSeconds + 4.0;
      const clipKey = brollMatch?.providerAssetId || brollMatch?.broll?.id || videoSourcePath;

      // Calculate intelligent, non-repetitive inPoint and outPoint
      const { inPoint, outPoint } = this.calculateSourceRange(
        clipKey,
        sourceDuration,
        durationSeconds,
        clipIntervals,
        isHook
      );

      // Select contextual, non-repetitive motion
      const motion = this.selectEditorialMotion(role, isHook, motionHistory, rawShots.length);
      motionHistory.push(motion);
      if (motion === 'static') staticHoldsCount++;

      // Select transition (hard cut is default, deliberate fade/flash on major turns)
      const transition = this.selectEditorialTransition(
        role,
        shot.sceneIndex,
        shot.shotIndex,
        lastTransition,
        isHook
      );
      lastTransition = transition;

      // Select pattern interrupt if editorial moment warrants it and cooldown met (min 10s between interrupts)
      let patternInterrupt: PatternInterrupt | undefined;
      const timeSinceLastInterrupt = cumulativeTime - lastInterruptTime;

      if (timeSinceLastInterrupt >= 10.0 || isHook) {
        patternInterrupt = this.evaluatePatternInterrupt(role, isHook, shot.narrationClause);
        if (patternInterrupt) {
          lastInterruptTime = cumulativeTime;
          patternInterruptCount++;
        }
      }

      // Determine caption treatment
      const captionTreatment = this.determineCaptionTreatment(role, isHook);

      const decision: EditorialDecision = {
        shotId: shot.id,
        sceneIndex: shot.sceneIndex,
        shotIndex: shot.shotIndex,
        role,
        narrationClause: shot.narrationClause,
        durationSeconds,
        videoSourcePath,
        sourceDurationSeconds: sourceDuration,
        inPoint,
        outPoint,
        motionEffect: motion,
        motionIntensity: isHook || isClimax ? 'dramatic' : motion === 'static' ? 'subtle' : 'moderate',
        cropMode: patternInterrupt?.type === 'punch_in' || role === 'hook' ? 'punch_in' : 'standard',
        transition,
        captionTreatment,
        patternInterrupt,
        editorialReason: this.describeEditorialReason(role, motion, durationSeconds, patternInterrupt),
        pacingWeight: Math.round((durationSeconds / (input.totalDurationSeconds / rawShots.length)) * 100) / 100,
      };

      decisions.push(decision);
      cumulativeTime += durationSeconds;
    }

    // Variety metrics computation
    const uniqueMotions = new Set(decisions.map((d) => d.motionEffect)).size;
    const varietyScore = Math.min(100, Math.round((uniqueMotions / 5) * 60 + (staticHoldsCount > 0 ? 25 : 0) + (patternInterruptCount > 0 ? 15 : 0)));

    const rapidShotsCount = decisions.filter((d) => d.durationSeconds <= 1.8).length;
    const holdsCount = decisions.filter((d) => d.durationSeconds >= 2.8).length;

    const plan: EditorialPlan = {
      totalDurationSeconds: Math.round(decisions.reduce((sum, d) => sum + d.durationSeconds, 0) * 100) / 100,
      decisions,
      pacingBreakdown: {
        hookDuration: decisions[0]?.durationSeconds || 0,
        averageShotDuration: Math.round((input.totalDurationSeconds / decisions.length) * 100) / 100,
        shotCount: decisions.length,
        rapidShotsCount,
        holdsCount,
        staticHoldsCount,
      },
      varietyScore,
      patternInterruptCount,
    };

    this.logger?.info(
      `Editorial plan finalized: ${decisions.length} cuts, hook=${plan.pacingBreakdown.hookDuration}s, variety=${varietyScore}/100, interrupts=${patternInterruptCount}, staticHolds=${staticHoldsCount}`
    );

    return plan;
  }

  /**
   * Classifies a narration clause into an editorial retention role.
   */
  public classifyShotRole(
    clause: string,
    shotIdx: number,
    totalShots: number,
    brief?: ResearchBrief
  ): EditorialRole {
    if (shotIdx === 0) {
      return 'hook';
    }

    if (shotIdx === totalShots - 1) {
      return 'conclusion';
    }

    if (shotIdx === totalShots - 2 && totalShots >= 4) {
      return 'payoff';
    }

    const lower = clause.toLowerCase();

    // Questions and curiosity drivers
    if (clause.includes('?') || /^(what if|why do|could this|how does|who|where is|is it possible)/i.test(lower)) {
      return 'question';
    }

    // Concrete numbers, measurements, statistics
    if (/\b\d+([,.]\d+)?(\s*(trillion|billion|million|thousand|percent|times|x|years?|km|miles?|seconds?|ms))\b/i.test(lower) || /\b\d{2,}\b/.test(lower)) {
      return 'statistic';
    }

    // Major reveals and breakthroughs
    if (/discovered|turns out|revealed|the truth is|secret|unmasked|found that|actually|real reason/i.test(lower)) {
      return 'reveal';
    }

    // High-stakes escalation or dramatic forces
    if (/unleashes|explodes|shatters|supernova|extreme|deadly|massive|cataclysm|bursts|crushes/i.test(lower)) {
      return 'escalation';
    }

    // Contrast statements
    if (/^(but|however|yet|instead|while|unlike|on the other hand)/i.test(lower)) {
      return 'contrast';
    }

    // Curiosity and mystery
    if (/mystery|mysterious|nobody knows|baffling|unexplained|unsolved|wonder/i.test(lower)) {
      return 'curiosity';
    }

    // Strong assertions / claims
    if (/proves|impossible|guaranteed|never before|unprecedented|defies/i.test(lower)) {
      return 'claim';
    }

    return 'fact';
  }

  /**
   * Distributes total duration dynamically based on role significance,
   * avoiding monotonous equal-length shots while preserving strict total time.
   */
  public calculatePacingDurations(
    shots: { id: string; narrationClause: string }[],
    roles: EditorialRole[],
    totalDurationSeconds: number
  ): number[] {
    const count = shots.length;
    if (count === 1) {
      return [Math.round(totalDurationSeconds * 100) / 100];
    }

    // Base weight multiplier by editorial role
    const roleMultipliers: Record<EditorialRole, number> = {
      hook: 0.90,        // Fast, punchy entry (1.6s - 2.2s)
      question: 1.05,    // Give tension a moment to resonate
      curiosity: 1.00,   // Balanced interest
      statistic: 0.85,   // Rapid, punchy delivery of numbers
      escalation: 0.85,  // Fast-paced excitement
      reveal: 1.30,      // Longer hold so viewer absorbs the key discovery
      contrast: 0.95,    // Crisp transition
      fact: 1.00,        // Standard explanation
      claim: 1.05,       // Authority weight
      payoff: 1.25,      // Satisfying hold at climax
      conclusion: 1.15,  // Memorable closing cadence
    };

    // Calculate raw weight for each shot combining word count and role multiplier
    const weights = shots.map((shot, idx) => {
      const words = shot.narrationClause.trim().split(/\s+/).length;
      const role = roles[idx];
      const multiplier = roleMultipliers[role] || 1.0;
      // Word pacing: approx 0.35s per word baseline with bounded clamp
      const baseWordWeight = Math.max(1.0, words * 0.4);
      return baseWordWeight * multiplier;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;

    // Initial allocation
    const rawDurations = weights.map((w) => (w / totalWeight) * totalDurationSeconds);

    // Relaxation passes to strictly enforce bounds: [0.9s, 4.2s] with hook cap (<= 2.2s)
    const minBound = 0.9;
    const maxBound = 4.2;
    const hookMax = 2.2;
    const effectiveMaxes = roles.map((r) => (r === 'hook' ? hookMax : maxBound));

    const bounded = [...rawDurations];
    for (let iter = 0; iter < 12; iter++) {
      let excess = 0;
      let adjustableCount = 0;

      for (let i = 0; i < bounded.length; i++) {
        if (bounded[i] > effectiveMaxes[i]) {
          excess += bounded[i] - effectiveMaxes[i];
          bounded[i] = effectiveMaxes[i];
        } else if (bounded[i] < minBound) {
          excess -= minBound - bounded[i];
          bounded[i] = minBound;
        } else {
          adjustableCount++;
        }
      }

      if (Math.abs(excess) < 0.005 || adjustableCount === 0) break;

      const adjustmentPerShot = excess / adjustableCount;
      for (let i = 0; i < bounded.length; i++) {
        if (bounded[i] > minBound && bounded[i] < effectiveMaxes[i]) {
          bounded[i] += adjustmentPerShot;
        }
      }
    }

    // Convert to 2-decimal rounded values and distribute any rounding remainder
    const rounded = bounded.map((b) => Math.round(b * 100) / 100);
    const currentSum = Math.round(rounded.reduce((a, b) => a + b, 0) * 100) / 100;
    let diffCents = Math.round((totalDurationSeconds - currentSum) * 100);

    const step = diffCents > 0 ? 1 : -1;
    let safeguard = 0;
    while (diffCents !== 0 && safeguard < 200) {
      safeguard++;
      for (let i = 0; i < count && diffCents !== 0; i++) {
        const testVal = Math.round((rounded[i] + step * 0.01) * 100) / 100;
        if (testVal >= minBound && testVal <= effectiveMaxes[i]) {
          rounded[i] = testVal;
          diffCents -= step;
        }
      }
    }

    return rounded;
  }

  /**
   * Selects non-overlapping inPoint and outPoint from the source clip.
   * Avoids the initial 0.5s-1.0s jitter and picks fresh sections when clips are reused.
   */
  public calculateSourceRange(
    clipKey: string,
    sourceDuration: number,
    requiredDuration: number,
    usedIntervals: Map<string, { start: number; end: number }[]>,
    isHook: boolean
  ): { inPoint: number; outPoint: number } {
    const priorIntervals = usedIntervals.get(clipKey) || [];

    // Max possible starting point that fits the required duration
    const maxStart = Math.max(0, sourceDuration - requiredDuration);

    let candidateInPoint = 0;

    if (maxStart > 1.0) {
      // Avoid initial camera start (first 0.5s - 1.0s)
      const bufferStart = isHook ? 0.2 : 0.8;

      if (priorIntervals.length === 0) {
        // First use: take from high-quality early-middle portion
        candidateInPoint = Math.min(bufferStart, maxStart);
      } else {
        // Clip reuse: find a gap or advance past previous uses
        const lastEnd = Math.max(...priorIntervals.map((inv) => inv.end));
        if (lastEnd + 0.5 + requiredDuration <= sourceDuration) {
          candidateInPoint = lastEnd + 0.5;
        } else {
          // Wrap with offset if source is tight
          candidateInPoint = Math.max(0, (maxStart * 0.5));
        }
      }
    } else {
      candidateInPoint = 0;
    }

    // Ensure strict bounds
    candidateInPoint = Math.max(0, Math.min(candidateInPoint, maxStart));
    const roundedIn = Math.round(candidateInPoint * 100) / 100;
    const roundedOut = Math.round((roundedIn + requiredDuration) * 100) / 100;

    // Record interval
    priorIntervals.push({ start: roundedIn, end: roundedOut });
    usedIntervals.set(clipKey, priorIntervals);

    return { inPoint: roundedIn, outPoint: roundedOut };
  }

  /**
   * Selects contextual motion while actively avoiding repetitive motion patterns.
   */
  public selectEditorialMotion(
    role: EditorialRole,
    isHook: boolean,
    history: EditorialMotion[],
    totalShots: number
  ): EditorialMotion {
    const lastMotion = history[history.length - 1];
    const prevMotion = history[history.length - 2];

    // Priority motion candidates by role
    let candidates: EditorialMotion[];

    if (isHook) {
      // Opening hook should be punchy and direct
      candidates = ['push_in', 'punch_in', 'static'];
    } else {
      switch (role) {
        case 'question':
        case 'curiosity':
          candidates = ['push_in', 'static', 'pan_left'];
          break;
        case 'statistic':
          // Static hold provides maximum clarity for reading numbers
          candidates = ['static', 'punch_in', 'pull_out'];
          break;
        case 'reveal':
          candidates = ['punch_in', 'push_in', 'pull_out'];
          break;
        case 'escalation':
          candidates = ['push_in', 'pan_right', 'pan_left'];
          break;
        case 'contrast':
          candidates = ['pan_left', 'pan_right', 'static'];
          break;
        case 'payoff':
          candidates = ['push_in', 'punch_in', 'static'];
          break;
        case 'conclusion':
          candidates = ['pull_out', 'static', 'push_in'];
          break;
        case 'fact':
        default:
          candidates = ['static', 'push_in', 'pan_left', 'pull_out', 'tilt_up'];
          break;
      }
    }

    // Anti-repetition selection: strictly avoid repeating the immediate previous motion
    for (const cand of candidates) {
      if (cand !== lastMotion) {
        return cand;
      }
    }

    // Fallback if all candidates match lastMotion
    const fallbacks: EditorialMotion[] = ['static', 'push_in', 'pan_right', 'pull_out', 'tilt_up'];
    for (const f of fallbacks) {
      if (f !== lastMotion && f !== prevMotion) {
        return f;
      }
    }

    return 'static';
  }

  /**
   * Selects purposeful transitions (hard cut default, deliberate fade/flash on major turns).
   */
  public selectEditorialTransition(
    role: EditorialRole,
    sceneIndex: number,
    shotIndex: number,
    lastTransition: EditorialTransition,
    isHook: boolean
  ): EditorialTransition {
    if (isHook) {
      return 'cut';
    }

    // Dramatic reveal flash
    if (role === 'reveal' && lastTransition !== 'flash') {
      return 'flash';
    }

    // Scene boundary transition
    if (shotIndex === 0 && sceneIndex > 0 && lastTransition === 'cut') {
      return role === 'payoff' ? 'flash' : 'fade';
    }

    return 'cut';
  }

  /**
   * Evaluates if an editorial moment warrants a visual pattern interrupt.
   */
  public evaluatePatternInterrupt(
    role: EditorialRole,
    isHook: boolean,
    narrationClause: string
  ): PatternInterrupt | undefined {
    if (isHook) {
      return {
        type: 'punch_in',
        label: 'Hook Immediacy Pop',
        intensity: 'bold',
      };
    }

    if (role === 'statistic') {
      return {
        type: 'statistic_callout',
        label: 'Key Data Pop',
        intensity: 'bold',
      };
    }

    if (role === 'reveal') {
      return {
        type: 'visual_reveal',
        label: 'Discovery Impact',
        intensity: 'bold',
      };
    }

    if (role === 'payoff') {
      return {
        type: 'punch_in',
        label: 'Climax Punch',
        intensity: 'bold',
      };
    }

    return undefined;
  }

  /**
   * Synchronizes caption treatment with editorial role.
   */
  private determineCaptionTreatment(role: EditorialRole, isHook: boolean): any {
    if (isHook) return 'hook_pop';
    if (role === 'statistic') return 'statistic_callout';
    if (role === 'reveal') return 'reveal_pop';
    if (role === 'payoff') return 'payoff_impact';
    return 'standard';
  }

  /**
   * Produces a human-readable explanation of the editorial decision.
   */
  private describeEditorialReason(
    role: EditorialRole,
    motion: EditorialMotion,
    duration: number,
    interrupt?: PatternInterrupt
  ): string {
    const interruptText = interrupt ? ` [Interrupt: ${interrupt.type}]` : '';
    return `Role: ${role.toUpperCase()} | Duration: ${duration.toFixed(2)}s | Motion: ${motion}${interruptText}`;
  }

  /**
   * Extracts flat list of shots from scene plan with backward compatibility.
   */
  private extractRawShots(scenePlan: ScenePlanOutput): {
    id: string;
    sceneIndex: number;
    shotIndex: number;
    narrationClause: string;
    durationSeconds: number;
  }[] {
    const shots: {
      id: string;
      sceneIndex: number;
      shotIndex: number;
      narrationClause: string;
      durationSeconds: number;
    }[] = [];

    if (scenePlan.shots && scenePlan.shots.length > 0) {
      return scenePlan.shots.map((s) => ({
        id: s.id,
        sceneIndex: s.sceneIndex,
        shotIndex: s.shotIndex,
        narrationClause: s.narrationClause,
        durationSeconds: s.durationSeconds,
      }));
    }

    for (const scene of scenePlan.scenes) {
      if (scene.shots && scene.shots.length > 0) {
        for (const s of scene.shots) {
          shots.push({
            id: s.id,
            sceneIndex: s.sceneIndex,
            shotIndex: s.shotIndex,
            narrationClause: s.narrationClause,
            durationSeconds: s.durationSeconds,
          });
        }
      } else {
        shots.push({
          id: `scene_${scene.index}_shot_0`,
          sceneIndex: scene.index,
          shotIndex: 0,
          narrationClause: scene.narration,
          durationSeconds: scene.durationSeconds,
        });
      }
    }

    return shots;
  }
}
