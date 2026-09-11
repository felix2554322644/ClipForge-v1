import { GeminiClient } from '../gemini/client';
import { PipelineLogger } from '../logging/logger';
import { EditorialEngine } from './editorialEngine';
import { AIDirectorValidator } from './validator';
import {
  AIDirectorInput,
  EditorialPlan,
  EditorialRole,
  EditorialMotion,
  EditorialTransition,
  CropMode,
  CaptionTreatmentType,
  PatternInterruptType,
} from '../../types/editorial';
import {
  CLIPFORGE_NICHE_PROFILE,
  getFormatProfile,
} from './profiles';

export interface AIDirectorOptions {
  geminiClient?: GeminiClient;
  deterministicEngine?: EditorialEngine;
  validator?: AIDirectorValidator;
  logger?: PipelineLogger;
}

export class AIDirectorService {
  private gemini: GeminiClient;
  private deterministicEngine: EditorialEngine;
  private validator: AIDirectorValidator;
  private logger?: PipelineLogger;

  constructor(options: AIDirectorOptions = {}) {
    this.gemini = options.geminiClient || new GeminiClient();
    this.deterministicEngine = options.deterministicEngine || new EditorialEngine(options.logger);
    this.validator = options.validator || new AIDirectorValidator();
    this.logger = options.logger;
  }

  /**
   * Main entry point for the AI Editorial Director.
   * Directs the video edit in a single structured pass, with deterministic validation
   * and fail-safe fallback to the deterministic editorial engine.
   */
  async directVideo(input: AIDirectorInput): Promise<EditorialPlan> {
    const formatProfile = getFormatProfile(input.format);
    const nicheProfile = input.nicheProfile || CLIPFORGE_NICHE_PROFILE;

    this.logger?.stage(
      'EDITORIAL_DECISION',
      `AI Editorial Director: Directing ${formatProfile.format.toUpperCase()} video (${input.targetDurationSeconds.toFixed(1)}s) across ${input.candidateBoard.totalCandidates} candidate assets`
    );

    // If Gemini is available, attempt the AI Director creative decision pass
    if (this.gemini.isAvailable()) {
      try {
        const prompt = this.buildDirectorPrompt(input, nicheProfile, formatProfile);
        this.logger?.info(`Dispatching AI Director prompt to Gemini (${prompt.length} chars)...`);

        const rawResponse = await this.gemini.generateJson<any>(prompt);

        // Deterministically validate and sanitize the AI Director's output
        const validatedPlan = this.validator.validateAndSanitize(rawResponse, input);

        if (validatedPlan && validatedPlan.decisions.length > 0) {
          const issues = this.validator.getIssues();
          if (issues.length > 0) {
            this.logger?.info(
              `AI Director output sanitized with ${issues.length} adjustments: ${issues.map((i) => i.actionTaken).slice(0, 3).join('; ')}`
            );
          }

          this.logger?.info(
            `AI Director generated valid editorial plan: ${validatedPlan.decisions.length} cuts, hook=${validatedPlan.pacingBreakdown.hookDuration}s, variety=${validatedPlan.varietyScore}/100, interrupts=${validatedPlan.patternInterruptCount}`
          );
          return validatedPlan;
        }

        this.logger?.warn(
          'AI Director returned invalid or unparseable plan. Falling back to deterministic editorial engine.'
        );
      } catch (err) {
        this.logger?.warn(
          `AI Director Gemini pass failed (${(err as Error).message}). Executing deterministic fallback.`
        );
      }
    } else {
      this.logger?.info(
        'Gemini is unavailable or unconfigured for AI Director. Using deterministic editorial engine.'
      );
    }

    // Safe, guaranteed fallback to the deterministic engine
    return this.executeDeterministicFallback(input);
  }

  /**
   * Deterministic fallback that maps candidate assets and scene plan into a verified EditorialPlan.
   */
  public executeDeterministicFallback(input: AIDirectorInput): EditorialPlan {
    this.logger?.info('Executing deterministic fallback editorial engine...');

    // If scenePlan and script are available, use the established EditorialEngine
    if (input.scenePlan && input.script) {
      // Map candidate board into SelectedBrollScene format
      const brollSelections = input.candidateBoard.candidates.map((c, idx) => ({
        sceneIndex: c.targetSceneIndex !== undefined ? c.targetSceneIndex : idx,
        shotId: c.targetShotId || `shot_${idx}`,
        shotIndex: 0,
        provider: c.provider,
        providerAssetId: c.providerAssetId,
        nativeVertical: c.nativeVertical,
        sourceDimensions: { width: c.width, height: c.height },
        sourceAspectRatio: c.aspectRatio,
        queryUsed: c.queryUsed,
        sourceUrl: c.sourceUrl,
        broll: {
          id: c.id,
          url: c.downloadUrl,
          videoPath: c.downloadUrl,
          originalWidth: c.width,
          originalHeight: c.height,
          aspectRatio: c.aspectRatio,
          durationSeconds: c.durationSeconds,
          relevanceScore: c.relevanceScore,
          source: c.provider,
          provider: c.provider,
          providerAssetId: c.providerAssetId,
          nativeVertical: c.nativeVertical,
        },
        inPoint: 0,
        outPoint: Math.min(c.durationSeconds, 4.0),
        reframedPath: c.downloadUrl,
      }));

      const plan = this.deterministicEngine.makeEditorialDecisions({
        scenePlan: input.scenePlan,
        brollSelections,
        script: input.script,
        totalDurationSeconds: input.targetDurationSeconds,
      });

      // Synchronize candidate IDs
      for (let i = 0; i < plan.decisions.length; i++) {
        const candidate = input.candidateBoard.candidates[i % input.candidateBoard.candidates.length];
        if (candidate) {
          plan.decisions[i].selectedCandidateId = candidate.id;
        }
      }

      return plan;
    }

    // Bare minimum procedural fallback if even scenePlan is absent
    const target = input.targetDurationSeconds;
    const avgShot = 2.5;
    const numShots = Math.max(1, Math.round(target / avgShot));
    const shotDuration = Math.round((target / numShots) * 100) / 100;

    const fallbackCandidate = input.candidateBoard.candidates[0] || {
      id: 'proc_fallback',
      downloadUrl: '',
      durationSeconds: 10.0,
      width: 1080,
      height: 1920,
    };

    return {
      totalDurationSeconds: target,
      decisions: Array.from({ length: numShots }, (_, i) => ({
        shotId: `shot_${i}`,
        sceneIndex: i,
        shotIndex: 0,
        selectedCandidateId: fallbackCandidate.id,
        role: i === 0 ? 'hook' : i === numShots - 1 ? 'conclusion' : 'fact',
        narrationClause: input.narrationText.slice(0, 40),
        durationSeconds: shotDuration,
        videoSourcePath: fallbackCandidate.downloadUrl,
        sourceDurationSeconds: fallbackCandidate.durationSeconds,
        inPoint: 0,
        outPoint: shotDuration,
        motionEffect: i === 0 ? 'punch_in' : 'zoom_in',
        motionIntensity: i === 0 ? 'dramatic' : 'moderate',
        cropMode: 'standard',
        transition: 'cut',
        captionTreatment: i === 0 ? 'hook_pop' : 'standard',
        editorialReason: 'Deterministic fallback cut',
        pacingWeight: 1.0,
      })),
      pacingBreakdown: {
        hookDuration: shotDuration,
        averageShotDuration: shotDuration,
        shotCount: numShots,
        rapidShotsCount: shotDuration <= 1.8 ? numShots : 0,
        holdsCount: shotDuration >= 3.0 ? numShots : 0,
        staticHoldsCount: 0,
      },
      varietyScore: 60,
      patternInterruptCount: 0,
      editorialNarrativeArc: 'Deterministic fallback narrative arc',
    };
  }

  /**
   * Constructs a comprehensive, single-pass prompt for the Gemini AI Director.
   */
  public buildDirectorPrompt(
    input: AIDirectorInput,
    niche: typeof CLIPFORGE_NICHE_PROFILE,
    profile: ReturnType<typeof getFormatProfile>
  ): string {
    const candidatesSummary = input.candidateBoard.candidates.map((c, i) => ({
      index: i + 1,
      id: c.id,
      provider: c.provider,
      providerAssetId: c.providerAssetId,
      durationSeconds: c.durationSeconds,
      dimensions: `${c.width}x${c.height}`,
      isNativeVertical: c.nativeVertical,
      tags: c.tags.slice(0, 6).join(', '),
      relevanceScore: Math.round(c.relevanceScore * 100) / 100,
      sourceUrl: c.sourceUrl || '',
      thumbnailUrl: c.thumbnailUrl || c.previewUrl || undefined,
      suggestedForScene: c.targetSceneIndex,
    }));

    const scenesSummary = input.scenePlan?.scenes.map((s) => ({
      sceneIndex: s.index,
      narration: s.narration,
      durationSeconds: s.durationSeconds,
      searchQuery: s.brollQuery || [],
      shots: s.shots?.map((sh) => ({
        id: sh.id,
        shotIndex: sh.shotIndex,
        clause: sh.narrationClause,
        suggestedDuration: sh.durationSeconds,
      })),
    }));

    const availableMotions: EditorialMotion[] = input.availableMotions || [
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
    ];

    const availableCropModes: CropMode[] = input.availableCropModes || [
      'standard',
      'punch_in',
      'tight',
      'wide',
    ];

    const availableTransitions: EditorialTransition[] = input.availableTransitions || [
      'cut',
      'fade',
      'flash',
      'crossfade',
    ];

    const availableCaptionTreatments: CaptionTreatmentType[] = input.availableCaptionTreatments || [
      'standard',
      'hook_pop',
      'statistic_callout',
      'reveal_pop',
      'payoff_impact',
    ];

    const availablePatternInterrupts: PatternInterruptType[] = input.availablePatternInterrupts || [
      'punch_in',
      'statistic_callout',
      'visual_reveal',
      'crop_reframe',
      'text_flash',
    ];

    return `
You are the AI Editorial Director of ClipForge, an autonomous, retention-first video engine.
Your mission is to make the high-level creative editorial and directing decisions for this video in ONE structured pass.
ClipForge's deterministic TypeScript/FFmpeg pipeline will execute, reframe, and render your exact plan.

====================================================
1. NICHE & AUDIENCE PROFILE (LOCKED CONTEXT)
====================================================
- Niche: ${niche.niche}
- Format Style: ${niche.format}
- Target Audience: ${niche.audience}
- Language: ${niche.language}
- Primary Geography: ${niche.primaryGeography}
- Core Content Pillars:
${niche.contentPillars.map((p) => `  * ${p}`).join('\n')}

====================================================
2. VIDEO FORMAT PROFILE: ${profile.format.toUpperCase()}
====================================================
- Orientation: ${profile.aspectRatio} (${profile.aspectRatio === '9:16' ? 'Vertical Portrait 1080x1920' : 'Landscape'})
- Target Duration: EXACTLY ${input.targetDurationSeconds.toFixed(2)} seconds
- Pacing Style: ${profile.pacingStyle}
- Shot Duration Boundaries: ${profile.shotDurationRange.min}s to ${profile.shotDurationRange.max}s (target average: ~${profile.shotDurationRange.targetAverage}s)
- Opening Hook Cut Max Duration: ${profile.hookDurationMax}s
- Pattern Interrupt Cooldown: minimum ${profile.patternInterruptCooldownSeconds}s between interrupts
- Editorial Guidelines:
${profile.guidelines.map((g) => `  * ${g}`).join('\n')}

====================================================
3. COMPLETE SCRIPT & NARRATION TIMING
====================================================
Total Master Narration Audio Duration: ${input.narrationDurationSeconds.toFixed(2)}s
Complete Narration:
"${input.narrationText}"

Scene Structure:
${JSON.stringify(scenesSummary, null, 2)}

====================================================
4. B-ROLL CANDIDATE BOARD (AVAILABLE REAL ASSETS)
====================================================
You MUST select candidate assets strictly from this board using their exact "id".
DO NOT invent candidate IDs that are not in this list.
${JSON.stringify(candidatesSummary, null, 2)}

Previously Selected Assets in Session (avoid reusing if alternatives exist):
${JSON.stringify(input.previouslySelectedAssets || [], null, 2)}

====================================================
5. AVAILABLE EDITORIAL CONTROLS
====================================================
- Motion Effects: ${JSON.stringify(availableMotions)}
- Motion Intensities: ["subtle", "moderate", "dramatic"]
- Crop Modes: ${JSON.stringify(availableCropModes)}
- Transitions: ${JSON.stringify(availableTransitions)}
- Caption Treatments: ${JSON.stringify(availableCaptionTreatments)}
- Pattern Interrupts: ${JSON.stringify(availablePatternInterrupts)}

====================================================
6. DIRECTOR RESPONSIBILITIES & EDITORIAL RULES
====================================================
1. VISUAL VARIETY & RHYTHM:
   - Do NOT force one B-roll asset to cover an entire sentence or scene.
   - Introduce visual cuts when the narration shifts idea, delivers a number, reveals a fact, or reaches a dramatic turn.
   - Balance rapid dynamic cuts (1.2s - 2.0s) with breath/holding shots (2.8s - 3.5s).
2. TIMING & BOUNDS:
   - For every shot, specify inPoint and outPoint within the chosen asset's durationSeconds.
   - durationSeconds MUST equal (outPoint - inPoint).
   - inPoint must be >= 0. outPoint must be <= candidate.durationSeconds.
   - The SUM of durationSeconds across ALL decisions MUST equal EXACTLY ${input.targetDurationSeconds.toFixed(2)}s.
3. RETENTION MECHANICS:
   - Shot 1 MUST be a powerful 'hook' (duration <= ${profile.hookDurationMax}s, dramatic motion or punch_in, hook_pop caption).
   - Use 'contrast' or 'escalation' before reaching the 'payoff'.
   - Trigger pattern interrupts (e.g. punch_in or statistic_callout) only at critical narrative inflection points.
4. REUSE PROTECTION:
   - Prefer distinct candidate assets across shots.
   - If you reuse a candidate asset, pick a non-overlapping time range (e.g. if used [0s, 3s], next use must be [3.2s, 6s]).

====================================================
7. REQUIRED JSON RESPONSE SCHEMA
====================================================
Respond ONLY with a JSON object matching this schema:
{
  "totalDurationSeconds": ${input.targetDurationSeconds.toFixed(2)},
  "editorialNarrativeArc": "Brief explanation of how the visual cuts support the narrative progression",
  "decisions": [
    {
      "shotId": "shot_1",
      "sceneIndex": 0,
      "shotIndex": 0,
      "selectedCandidateId": "EXACT_ID_FROM_CANDIDATE_BOARD",
      "narrationClause": "Clause or sentence segment spoken during this shot",
      "inPoint": 0.8,
      "outPoint": 3.0,
      "durationSeconds": 2.2,
      "role": "hook",
      "motionEffect": "punch_in",
      "motionIntensity": "dramatic",
      "cropMode": "punch_in",
      "transition": "cut",
      "captionTreatment": "hook_pop",
      "patternInterrupt": {
        "type": "punch_in",
        "label": "Hook Focus",
        "intensity": "bold"
      },
      "editorialReason": "Punch in on galaxy cluster to shock the viewer in the first 2 seconds",
      "pacingWeight": 1.2
    }
  ]
}
`.trim();
  }
}
