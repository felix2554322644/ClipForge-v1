import {
  AIDirectorInput,
  CandidateBrollAsset,
  CaptionTreatmentType,
  CropMode,
  EditorialChapter,
  EditorialDecision,
  EditorialMotion,
  EditorialPlan,
  EditorialRole,
  EditorialTransition,
  PatternInterrupt,
  PatternInterruptType,
} from '../../types/editorial';
import { getFormatProfile } from './profiles';
import { VisualIntelligenceService } from './visualIntelligence';

const VALID_ROLES: Set<EditorialRole> = new Set([
  'hook',
  'curiosity',
  'question',
  'fact',
  'statistic',
  'claim',
  'escalation',
  'reveal',
  'contrast',
  'payoff',
  'conclusion',
]);

const VALID_MOTIONS: Set<EditorialMotion> = new Set([
  'push_in',
  'pull_out',
  'punch_in',
  'pan_left',
  'pan_right',
  'tilt_up',
  'tilt_down',
  'static',
  'zoom_in',
  'zoom_out',
]);

const VALID_INTENSITIES = new Set(['subtle', 'moderate', 'dramatic'] as const);
const VALID_CROP_MODES: Set<CropMode> = new Set(['standard', 'punch_in', 'tight', 'wide']);
const VALID_TRANSITIONS: Set<EditorialTransition> = new Set(['cut', 'fade', 'flash', 'crossfade']);
const VALID_CAPTION_TREATMENTS: Set<CaptionTreatmentType> = new Set([
  'standard',
  'hook_pop',
  'concept_emphasis',
  'statistic_callout',
  'reveal',
  'reveal_pop',
  'payoff_impact',
]);
const VALID_INTERRUPT_TYPES: Set<PatternInterruptType> = new Set([
  'punch_in',
  'statistic_callout',
  'visual_reveal',
  'crop_reframe',
  'text_flash',
]);

export interface ValidationIssue {
  field: string;
  issue: string;
  actionTaken: string;
}

export class AIDirectorValidator {
  private issues: ValidationIssue[] = [];

  getIssues(): ValidationIssue[] {
    return [...this.issues];
  }

  /**
   * Validates and deterministically sanitizes a raw AI Director plan against
   * the candidate board, format profile boundaries, and duration anchors.
   * Returns a sanitized EditorialPlan or null if the plan is irrecoverably invalid.
   */
  validateAndSanitize(rawPlan: any, input: AIDirectorInput): EditorialPlan | null {
    this.issues = [];

    // 1. Basic Schema Validation
    if (!rawPlan || typeof rawPlan !== 'object') {
      this.issues.push({ field: 'root', issue: 'Raw plan is not an object', actionTaken: 'Reject plan' });
      return null;
    }

    const rawDecisions = rawPlan.decisions;
    if (!Array.isArray(rawDecisions) || rawDecisions.length === 0) {
      this.issues.push({
        field: 'decisions',
        issue: 'Plan contains no decisions array or empty array',
        actionTaken: 'Reject plan',
      });
      return null;
    }

    const formatProfile = getFormatProfile(input.format);
    const targetDuration = input.targetDurationSeconds;
    const candidates = input.candidateBoard.candidates || [];

    // Map candidate assets by both id and providerAssetId for robust lookup
    const candidateMap = new Map<string, CandidateBrollAsset>();
    for (const c of candidates) {
      candidateMap.set(c.id, c);
      if (c.providerAssetId) {
        candidateMap.set(c.providerAssetId, c);
      }
    }

    // Interval tracker to prevent overlapping footage when reusing candidate assets
    const usedIntervals = new Map<string, { start: number; end: number }[]>();
    const usedCandidateCounts = new Map<string, number>();

    const sanitizedDecisions: EditorialDecision[] = [];

    for (let idx = 0; idx < rawDecisions.length; idx++) {
      const raw = rawDecisions[idx] || {};
      const isHook = idx === 0;
      const isConclusion = idx === rawDecisions.length - 1;

      // Shot ID
      const shotId =
        typeof raw.shotId === 'string' && raw.shotId.trim().length > 0
          ? raw.shotId.trim()
          : `shot_${idx}`;

      const sceneIndex = typeof raw.sceneIndex === 'number' ? raw.sceneIndex : idx;
      const shotIndex = typeof raw.shotIndex === 'number' ? raw.shotIndex : 0;

      // 2. Candidate Resolution & Duplicate / Existence Protection
      let candidateId = String(raw.selectedCandidateId || raw.candidateAssetId || raw.assetId || '').trim();
      let candidate = candidateMap.get(candidateId);

      if (!candidate) {
        this.issues.push({
          field: `decisions[${idx}].selectedCandidateId`,
          issue: `Candidate "${candidateId}" does not exist on candidate board`,
          actionTaken: 'Remapped to best matching valid candidate on board',
        });

        // Find candidate matching scene or first available
        candidate =
          candidates.find((c) => c.targetSceneIndex === sceneIndex) ||
          candidates[idx % Math.max(1, candidates.length)] ||
          candidates[0];

        candidateId = candidate ? candidate.id : `proc_${shotId}`;
      }

      // Consecutive identical candidate asset check:
      // Prevent the exact same asset from being cut to in consecutive shots if alternatives exist
      const prevDecision = sanitizedDecisions[sanitizedDecisions.length - 1];
      if (prevDecision && prevDecision.selectedCandidateId === candidateId && candidates.length > 1) {
        const alternative =
          candidates.find(
            (c) => c.id !== candidateId && (!usedCandidateCounts.has(c.id) || usedCandidateCounts.get(c.id)! === 0)
          ) || candidates.find((c) => c.id !== candidateId);

        if (alternative) {
          this.issues.push({
            field: `decisions[${idx}].selectedCandidateId`,
            issue: `Consecutive identical candidate asset "${candidateId}" detected`,
            actionTaken: `Switched to alternative candidate "${alternative.id}" to prevent visual repetition`,
          });
          candidate = alternative;
          candidateId = alternative.id;
        }
      }

      // Duplicate asset reuse check: If candidate is reused, check interval availability
      const existingIntervals = usedIntervals.get(candidateId) || [];
      const timesUsed = usedCandidateCounts.get(candidateId) || 0;
      const sourceTotalDuration = candidate ? candidate.durationSeconds : 10.0;

      if (timesUsed > 0 && sourceTotalDuration <= 3.0) {
        // Source clip is too short to reuse without identical frames: find alternative candidate
        const alternative = candidates.find(
          (c) => !usedCandidateCounts.has(c.id) && c.id !== candidateId
        );
        if (alternative) {
          this.issues.push({
            field: `decisions[${idx}].selectedCandidateId`,
            issue: `Candidate ${candidateId} too short for reuse; switching to avoid duplicate`,
            actionTaken: `Switched to alternative candidate ${alternative.id}`,
          });
          candidate = alternative;
          candidateId = alternative.id;
        }
      }

      // Provider run limit check: prevent one provider from dominating without variety
      const maxProviderRun = formatProfile.repetitionThresholds?.maxConsecutiveSameProvider || 3;
      if (sanitizedDecisions.length >= maxProviderRun && candidate) {
        const lastN = sanitizedDecisions.slice(-maxProviderRun);
        const currentCandidate = candidate;
        const allSameProvider = lastN.every((d) => {
          const prior = candidateMap.get(d.selectedCandidateId || '');
          return prior && prior.provider === currentCandidate.provider;
        });

        if (allSameProvider) {
          const altProviderCandidate =
            candidates.find(
              (c) => c.provider !== currentCandidate.provider && !usedCandidateCounts.has(c.id)
            ) || candidates.find((c) => c.provider !== currentCandidate.provider);

          if (altProviderCandidate) {
            this.issues.push({
              field: `decisions[${idx}].selectedCandidateId`,
              issue: `Provider "${currentCandidate.provider}" exceeded ${maxProviderRun} consecutive cuts`,
              actionTaken: `Switched to candidate "${altProviderCandidate.id}" (${altProviderCandidate.provider}) for provider diversity`,
            });
            candidate = altProviderCandidate;
            candidateId = altProviderCandidate.id;
          }
        }
      }

      usedCandidateCounts.set(candidateId, (usedCandidateCounts.get(candidateId) || 0) + 1);

      // 3. Duration Clamping
      let rawDuration = typeof raw.durationSeconds === 'number' ? raw.durationSeconds : 2.5;
      if (isNaN(rawDuration) || rawDuration <= 0) {
        rawDuration = formatProfile.shotDurationRange.targetAverage;
      }

      // Clamp shot duration within format boundaries
      let clampedDuration = Math.max(
        formatProfile.shotDurationRange.min,
        Math.min(formatProfile.shotDurationRange.max, rawDuration)
      );

      // Enforce hook maximum constraint
      if (isHook) {
        clampedDuration = Math.min(clampedDuration, formatProfile.hookDurationMax);
      }

      // 4. InPoint & OutPoint Range Validation and Clamping
      let inPoint = typeof raw.inPoint === 'number' && !isNaN(raw.inPoint) ? raw.inPoint : 0;
      if (inPoint < 0) {
        this.issues.push({
          field: `decisions[${idx}].inPoint`,
          issue: `Negative inPoint (${inPoint})`,
          actionTaken: 'Clamped inPoint to 0',
        });
        inPoint = 0;
      }

      // If clip was previously used, ensure inPoint skips past prior interval
      const intervals = usedIntervals.get(candidateId) || [];
      if (intervals.length > 0) {
        const lastInterval = intervals[intervals.length - 1];
        if (inPoint < lastInterval.end) {
          inPoint = Math.round((lastInterval.end + 0.1) * 100) / 100;
        }
      }

      // Clamp within source video length
      if (inPoint + clampedDuration > sourceTotalDuration) {
        if (sourceTotalDuration >= clampedDuration) {
          inPoint = Math.max(0, Math.round((sourceTotalDuration - clampedDuration) * 100) / 100);
        } else {
          clampedDuration = Math.max(0.8, sourceTotalDuration);
          inPoint = 0;
        }
      }

      const outPoint = Math.round((inPoint + clampedDuration) * 100) / 100;
      clampedDuration = Math.round((outPoint - inPoint) * 100) / 100;

      // Record interval for anti-duplicate tracking
      intervals.push({ start: inPoint, end: outPoint });
      usedIntervals.set(candidateId, intervals);

      // 5. Editorial Role
      let role: EditorialRole = raw.role;
      if (!VALID_ROLES.has(role)) {
        role = isHook ? 'hook' : isConclusion ? 'conclusion' : 'fact';
      }

      // 6. Motion Effect & Intensity
      let motionEffect: EditorialMotion = raw.motionEffect;
      if (!VALID_MOTIONS.has(motionEffect)) {
        motionEffect = isHook ? 'punch_in' : 'zoom_in';
      }

      let motionIntensity: 'subtle' | 'moderate' | 'dramatic' = raw.motionIntensity;
      if (!VALID_INTENSITIES.has(motionIntensity as any)) {
        motionIntensity = isHook || role === 'payoff' ? 'dramatic' : motionEffect === 'static' ? 'subtle' : 'moderate';
      }

      // 7. Crop Mode & Transitions
      let cropMode: CropMode = raw.cropMode;
      if (!VALID_CROP_MODES.has(cropMode)) {
        cropMode = 'standard';
      }

      // Prevent 3 consecutive identical crop modes to ensure framing variety
      if (sanitizedDecisions.length >= 2) {
        const p1 = sanitizedDecisions[sanitizedDecisions.length - 1];
        const p2 = sanitizedDecisions[sanitizedDecisions.length - 2];
        if (p1.cropMode === cropMode && p2.cropMode === cropMode) {
          cropMode = cropMode === 'standard' ? 'punch_in' : 'standard';
        }
      }

      let transition: EditorialTransition = raw.transition;
      if (!VALID_TRANSITIONS.has(transition)) {
        transition = 'cut';
      }

      // 8. Caption Treatment
      let captionTreatment: CaptionTreatmentType = raw.captionTreatment;
      if (!VALID_CAPTION_TREATMENTS.has(captionTreatment)) {
        captionTreatment = isHook ? 'hook_pop' : role === 'statistic' ? 'statistic_callout' : 'standard';
      }

      // 9. Pattern Interrupt
      let patternInterrupt: PatternInterrupt | undefined;
      if (raw.patternInterrupt && typeof raw.patternInterrupt === 'object') {
        const pType = raw.patternInterrupt.type;
        if (VALID_INTERRUPT_TYPES.has(pType)) {
          patternInterrupt = {
            type: pType,
            label: typeof raw.patternInterrupt.label === 'string' ? raw.patternInterrupt.label : undefined,
            intensity: raw.patternInterrupt.intensity === 'bold' ? 'bold' : 'subtle',
          };
        }
      }

      const narrationClause =
        typeof raw.narrationClause === 'string' && raw.narrationClause.trim().length > 0
          ? raw.narrationClause.trim()
          : input.narrationText.slice(0, 50);

      const editorialReason =
        typeof raw.editorialReason === 'string' && raw.editorialReason.trim().length > 0
          ? raw.editorialReason.trim()
          : `${role} visual cut with ${motionEffect} motion`;

      const pacingWeight =
        typeof raw.pacingWeight === 'number' && !isNaN(raw.pacingWeight) && raw.pacingWeight > 0
          ? Math.round(raw.pacingWeight * 100) / 100
          : 1.0;

      // 10. Visual description and contrast notes
      const visRef = candidate?.visualReference || (candidate ? VisualIntelligenceService.evaluateVisualReference(candidate) : undefined);
      const visualDescription =
        typeof raw.visualDescription === 'string' && raw.visualDescription.trim().length > 0
          ? raw.visualDescription.trim()
          : visRef?.visualDescription;

      let visualContrastNote: string | undefined =
        typeof raw.visualContrastNote === 'string' && raw.visualContrastNote.trim().length > 0
          ? raw.visualContrastNote.trim()
          : undefined;

      if (!visualContrastNote && sanitizedDecisions.length > 0 && candidate) {
        const priorCand = candidateMap.get(sanitizedDecisions[sanitizedDecisions.length - 1].selectedCandidateId || '');
        if (priorCand) {
          const contrast = VisualIntelligenceService.evaluateVisualContrast(priorCand, candidate);
          visualContrastNote = contrast.editorialNote;
        }
      }

      sanitizedDecisions.push({
        shotId,
        sceneIndex,
        shotIndex,
        selectedCandidateId: candidateId,
        role,
        narrationClause,
        durationSeconds: clampedDuration,
        videoSourcePath: candidate ? candidate.downloadUrl : '',
        sourceDurationSeconds: sourceTotalDuration,
        inPoint,
        outPoint,
        motionEffect,
        motionIntensity,
        cropMode,
        transition,
        captionTreatment,
        patternInterrupt,
        editorialReason,
        pacingWeight,
        visualDescription,
        visualContrastNote,
      });
    }

    // 11. Duration Normalization: Sum must match targetDurationSeconds exactly
    this.normalizeTotalDuration(
      sanitizedDecisions,
      targetDuration,
      formatProfile.shotDurationRange.max
    );

    // 12. Variety & Pacing Metrics Computation
    const rapidShotsCount = sanitizedDecisions.filter((d) => d.durationSeconds <= 1.8).length;
    const holdsCount = sanitizedDecisions.filter((d) => d.durationSeconds >= 3.0).length;
    const staticHoldsCount = sanitizedDecisions.filter((d) => d.motionEffect === 'static').length;
    const patternInterruptCount = sanitizedDecisions.filter((d) => !!d.patternInterrupt).length;
    const uniqueMotions = new Set(sanitizedDecisions.map((d) => d.motionEffect)).size;
    const uniqueCandidates = new Set(sanitizedDecisions.map((d) => d.selectedCandidateId)).size;
    const candidateVarietyRatio = sanitizedDecisions.length > 0 ? uniqueCandidates / sanitizedDecisions.length : 1.0;

    const varietyScore = Math.min(
      100,
      Math.round(
        (uniqueMotions / 5) * 50 +
          candidateVarietyRatio * 30 +
          (staticHoldsCount > 0 ? 10 : 0) +
          (patternInterruptCount > 0 ? 10 : 0)
      )
    );

    // Visual Continuity Score (0-100)
    const repetitionPenalties = this.issues.filter((i) => i.issue.includes('repetition') || i.issue.includes('duplicate')).length;
    const visualContinuityScore = Math.max(50, Math.min(100, Math.round(85 + (uniqueCandidates >= 3 ? 15 : 0) - repetitionPenalties * 5)));

    // Composition Variety Score (0-100)
    const uniqueCrops = new Set(sanitizedDecisions.map((d) => d.cropMode)).size;
    const compositionVarietyScore = Math.min(100, Math.round((uniqueCrops / 3) * 60 + candidateVarietyRatio * 40));

    // 13. Chapters for Long-Form
    let chapters: EditorialChapter[] | undefined;
    if (formatProfile.format === 'long' || input.format === 'long') {
      chapters = this.buildLongFormChapters(sanitizedDecisions, input);
    }

    const plan: EditorialPlan = {
      totalDurationSeconds: Math.round(targetDuration * 100) / 100,
      format: formatProfile.format,
      decisions: sanitizedDecisions,
      pacingBreakdown: {
        hookDuration: sanitizedDecisions[0]?.durationSeconds || 0,
        averageShotDuration: Math.round((targetDuration / sanitizedDecisions.length) * 100) / 100,
        shotCount: sanitizedDecisions.length,
        rapidShotsCount,
        holdsCount,
        staticHoldsCount,
      },
      varietyScore,
      visualContinuityScore,
      compositionVarietyScore,
      repetitionPenalties,
      patternInterruptCount,
      chapters,
      editorialNarrativeArc:
        typeof rawPlan.editorialNarrativeArc === 'string'
          ? rawPlan.editorialNarrativeArc
          : formatProfile.format === 'long'
          ? 'Cinematic chapter-based narrative arc with progressive escalation and deep conceptual holds'
          : 'Retention-optimized narrative arc with hook-reveal-payoff structure',
    };

    return plan;
  }

  /**
   * Builds structured chapters for long-form video editorial plans.
   */
  private buildLongFormChapters(
    decisions: EditorialDecision[],
    input: AIDirectorInput
  ): EditorialChapter[] {
    if (decisions.length === 0) return [];

    // If input already defined chapters, map decisions to them
    if (input.chapters && input.chapters.length > 0) {
      let currentShot = 0;
      let currentTime = 0;

      return input.chapters.map((ch, idx) => {
        const startShot = currentShot;
        const startTime = currentTime;
        let chapterDuration = 0;

        while (currentShot < decisions.length && (currentTime < ch.approxEndTime || idx === input.chapters!.length - 1)) {
          chapterDuration += decisions[currentShot].durationSeconds;
          currentTime += decisions[currentShot].durationSeconds;
          currentShot++;
        }

        return {
          chapterIndex: idx + 1,
          title: ch.title,
          startShotIndex: startShot,
          endShotIndex: Math.max(startShot, currentShot - 1),
          startTime: Math.round(startTime * 100) / 100,
          endTime: Math.round(currentTime * 100) / 100,
          durationSeconds: Math.round(chapterDuration * 100) / 100,
          visualTheme: decisions[startShot]?.visualDescription || 'Thematic chapter progression',
          pacingStyle: idx === 0 ? 'engaging hook' : 'narrative hold',
        };
      });
    }

    // Otherwise segment decisions into logical 3-chapter arc
    const chapterCount = Math.max(2, Math.min(4, Math.ceil(decisions.length / 3)));
    const shotsPerChapter = Math.ceil(decisions.length / chapterCount);
    const chapterTitles = ['Opening Foundation', 'Core Revelation & Escalation', 'Climax & Synthesis', 'Final Payoff'];

    const chapters: EditorialChapter[] = [];
    let currentTime = 0;

    for (let c = 0; c < chapterCount; c++) {
      const startIdx = c * shotsPerChapter;
      const endIdx = Math.min(decisions.length - 1, (c + 1) * shotsPerChapter - 1);
      if (startIdx > endIdx) break;

      const chapterShots = decisions.slice(startIdx, endIdx + 1);
      const chapterDuration = chapterShots.reduce((acc, s) => acc + s.durationSeconds, 0);

      chapters.push({
        chapterIndex: c + 1,
        title: chapterTitles[c] || `Chapter ${c + 1}`,
        startShotIndex: startIdx,
        endShotIndex: endIdx,
        startTime: Math.round(currentTime * 100) / 100,
        endTime: Math.round((currentTime + chapterDuration) * 100) / 100,
        durationSeconds: Math.round(chapterDuration * 100) / 100,
        visualTheme: decisions[startIdx]?.visualDescription || 'Thematic chapter progression',
        pacingStyle: c === 0 ? 'hook and premise' : c === chapterCount - 1 ? 'dramatic conclusion' : 'deep explanation hold',
      });

      currentTime += chapterDuration;
    }

    return chapters;
  }

  /**
   * Proportionally normalizes decision durations so the sum equals targetDuration exactly,
   * subdividing decisions if format max duration would otherwise be exceeded.
   */
  private normalizeTotalDuration(
    decisions: EditorialDecision[],
    targetDuration: number,
    maxDuration: number = 4.0
  ): void {
    // If the average duration exceeds max allowed shot duration (e.g. short-form),
    // subdivide decisions to maintain pacing
    let needsSubdivision = true;
    let loopGuard = 0;
    while (needsSubdivision && loopGuard < 20) {
      loopGuard++;
      needsSubdivision = false;
      const currentAvg = targetDuration / decisions.length;
      if (currentAvg > maxDuration) {
        // Find longest decision and split in two
        let maxIdx = 0;
        let maxVal = decisions[0].durationSeconds;
        for (let i = 1; i < decisions.length; i++) {
          if (decisions[i].durationSeconds > maxVal) {
            maxVal = decisions[i].durationSeconds;
            maxIdx = i;
          }
        }
        const toSplit = decisions[maxIdx];
        const halfDuration = Math.round((toSplit.durationSeconds / 2) * 100) / 100;
        const sub1: EditorialDecision = {
          ...toSplit,
          shotId: `${toSplit.shotId}_a`,
          shotIndex: 0,
          durationSeconds: halfDuration,
          outPoint: Math.round((toSplit.inPoint + halfDuration) * 100) / 100,
        };
        const sub2: EditorialDecision = {
          ...toSplit,
          shotId: `${toSplit.shotId}_b`,
          shotIndex: 1,
          durationSeconds: halfDuration,
          inPoint: sub1.outPoint,
          outPoint: Math.round((sub1.outPoint + halfDuration) * 100) / 100,
          motionEffect: toSplit.motionEffect === 'zoom_in' ? 'pan_left' : 'zoom_in',
        };
        decisions.splice(maxIdx, 1, sub1, sub2);
        needsSubdivision = true;
      }
    }

    const currentSum = decisions.reduce((acc, d) => acc + d.durationSeconds, 0);
    const diff = targetDuration - currentSum;

    if (Math.abs(diff) < 0.001) {
      return;
    }

    // Scale each decision proportionally
    const scaleFactor = targetDuration / currentSum;
    let accumulated = 0;

    for (let i = 0; i < decisions.length; i++) {
      if (i === decisions.length - 1) {
        // Last decision absorbs rounding difference to ensure exact floating match
        decisions[i].durationSeconds = Math.round((targetDuration - accumulated) * 100) / 100;
      } else {
        const scaled = Math.round(decisions[i].durationSeconds * scaleFactor * 100) / 100;
        decisions[i].durationSeconds = scaled;
        accumulated += scaled;
      }

      // Recalculate outPoint to remain strictly synced with duration
      decisions[i].outPoint = Math.round((decisions[i].inPoint + decisions[i].durationSeconds) * 100) / 100;
    }
  }
}
