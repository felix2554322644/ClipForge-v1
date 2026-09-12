import { GeminiClient } from '../gemini/client';
import { PipelineLogger } from '../logging/logger';
import { EditorialEngine } from './editorialEngine';
import { AIDirectorValidator } from './validator';
import { VisualIntelligenceService } from './visualIntelligence';
import { VisualGroundingService } from './visualGrounding';
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
  visualGrounding?: VisualGroundingService;
  logger?: PipelineLogger;
}

export class AIDirectorService {
  private gemini: GeminiClient;
  private deterministicEngine: EditorialEngine;
  private validator: AIDirectorValidator;
  private visualGrounding: VisualGroundingService;
  private logger?: PipelineLogger;

  constructor(options: AIDirectorOptions = {}) {
    this.gemini = options.geminiClient || new GeminiClient();
    this.deterministicEngine = options.deterministicEngine || new EditorialEngine(options.logger);
    this.validator = options.validator || new AIDirectorValidator();
    this.visualGrounding = options.visualGrounding || new VisualGroundingService({ logger: options.logger });
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
        // Phase 10: Acquire lightweight thumbnail image frames for multimodal visual grounding
        const framesAcquired = await this.visualGrounding.acquireFramesForCandidateBoard(input.candidateBoard);
        const hasFrames = framesAcquired > 0 || input.candidateBoard.candidates.some((c) => Boolean(c.thumbnailBase64));

        let rawResponse: any;

        if (hasFrames) {
          this.logger?.info(
            `Dispatching multimodal AI Director prompt with real visual frame grounding (${framesAcquired} images)...`
          );
          const multimodalContents = this.visualGrounding.buildMultimodalContents(input, nicheProfile, formatProfile);
          rawResponse = await this.gemini.generateJson<any>(multimodalContents);
        } else {
          const prompt = this.buildDirectorPrompt(input, nicheProfile, formatProfile);
          this.logger?.info(`Dispatching text-only AI Director prompt to Gemini (${prompt.length} chars)...`);
          rawResponse = await this.gemini.generateJson<any>(prompt);
        }

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
    const formatProfile = getFormatProfile(input.format);

    // If storyboard is available, create decisions directly aligned with storyboard visual beats
    if (input.storyboard && input.storyboard.shots.length > 0) {
      const shots = input.storyboard.shots;
      const decisions = shots.map((sh, i) => {
        // Find candidate matching this shot ID or scene index
        const candidate =
          input.candidateBoard.candidates.find((c) => c.targetShotId === sh.shotId) ||
          input.candidateBoard.candidates.find((c) => c.targetSceneIndex === sh.sceneIndex) ||
          input.candidateBoard.candidates[i % input.candidateBoard.candidates.length] || {
            id: 'proc_fallback',
            downloadUrl: '',
            durationSeconds: 10.0,
            width: 1080,
            height: 1920,
          };

        const inPoint = 0;
        const outPoint = Math.min(candidate.durationSeconds || 10.0, sh.durationSeconds);
        const vis = candidate.visualReference || VisualIntelligenceService.evaluateVisualReference(candidate);

        let role: 'hook' | 'fact' | 'curiosity' | 'escalation' | 'payoff' | 'conclusion' = 'fact';
        if (sh.visualPurpose === 'hook_grab' || i === 0) role = 'hook';
        else if (sh.visualPurpose === 'closing_call_to_action' || i === shots.length - 1) role = 'conclusion';
        else if (sh.visualPurpose === 'mechanism_explanation') role = 'fact';
        else if (sh.visualPurpose === 'mystery_escalation') role = 'curiosity';
        else if (sh.visualPurpose === 'emotional_payoff') role = 'payoff';

        return {
          shotId: sh.shotId,
          sceneIndex: sh.sceneIndex,
          shotIndex: sh.shotIndex,
          selectedCandidateId: candidate.id,
          role,
          narrationClause: sh.narrationClause,
          durationSeconds: sh.durationSeconds,
          videoSourcePath: candidate.downloadUrl,
          sourceDurationSeconds: candidate.durationSeconds,
          inPoint,
          outPoint,
          motionEffect: (sh.suggestedMotionEffect as any) || (i === 0 ? 'punch_in' : i % 2 === 0 ? 'zoom_in' : 'pan_left'),
          motionIntensity: i === 0 ? ('dramatic' as const) : ('moderate' as const),
          cropMode: 'standard' as const,
          transition: (sh.suggestedTransition as any) || ('cut' as const),
          captionTreatment: i === 0 ? ('hook_pop' as const) : ('standard' as const),
          editorialReason: `Storyboard visual beat (${sh.visualPurpose}): ${sh.visualSubject}`,
          visualDescription: vis.visualDescription || sh.visualSubject,
          pacingWeight: 1.0,
        };
      });

      const avgDur = input.targetDurationSeconds / Math.max(1, decisions.length);
      return {
        totalDurationSeconds: input.targetDurationSeconds,
        format: formatProfile.format,
        decisions,
        varietyScore: 85,
        patternInterruptCount: 0,
        pacingBreakdown: {
          hookDuration: decisions[0]?.durationSeconds || 2.0,
          averageShotDuration: Math.round(avgDur * 100) / 100,
          shotCount: decisions.length,
          rapidShotsCount: decisions.filter((d) => d.durationSeconds <= 1.8).length,
          holdsCount: decisions.filter((d) => d.durationSeconds >= 3.0).length,
          staticHoldsCount: decisions.filter((d) => d.motionEffect === 'static').length,
        },
      };
    }

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

      // Synchronize candidate IDs and visual descriptions
      for (let i = 0; i < plan.decisions.length; i++) {
        const candidate = input.candidateBoard.candidates[i % input.candidateBoard.candidates.length];
        if (candidate) {
          plan.decisions[i].selectedCandidateId = candidate.id;
          const vis = candidate.visualReference || VisualIntelligenceService.evaluateVisualReference(candidate);
          plan.decisions[i].visualDescription = vis.visualDescription;
        }
      }

      plan.format = formatProfile.format;
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
    const candidatesSummary = input.candidateBoard.candidates.map((c, i) => {
      const vis = c.visualReference || VisualIntelligenceService.evaluateVisualReference(c);
      return {
        index: i + 1,
        id: c.id,
        provider: c.provider,
        providerAssetId: c.providerAssetId,
        durationSeconds: c.durationSeconds,
        dimensions: `${c.width}x${c.height}`,
        isNativeVertical: c.nativeVertical,
        tags: c.tags.slice(0, 6).join(', '),
        relevanceScore: Math.round(c.relevanceScore * 100) / 100,
        thumbnailUrl: c.thumbnailUrl || c.previewUrl || undefined,
        previewUrl: c.previewUrl || undefined,
        visualLook: vis.visualDescription,
        composition: vis.composition,
        dominantSubject: vis.dominantSubject,
        movement: vis.movementType,
        lightingMood: vis.lightingMood,
        visualEnergy: vis.visualEnergy,
        scrollStopNovelty: vis.visualNoveltyScore,
        aestheticQuality: vis.aestheticScore,
        suggestedForScene: c.targetSceneIndex,
      };
    });

    const storyboardSummary = input.storyboard?.shots.map((sh) => ({
      shotId: sh.shotId,
      sceneIndex: sh.sceneIndex,
      narrationClause: sh.narrationClause,
      timing: `${sh.narrationStart.toFixed(2)}s - ${sh.narrationEnd.toFixed(2)}s (${sh.durationSeconds.toFixed(2)}s)`,
      visualSubject: sh.visualSubject,
      action: sh.action,
      environment: sh.environment,
      emotion: sh.emotion,
      framing: sh.framing,
      cameraMovement: sh.cameraMovement,
      visualPurpose: sh.visualPurpose,
      visualPriority: sh.visualPriority,
      preferredVisualType: sh.preferredVisualType,
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
- Max Sustained Visual Hold: ${profile.visualHoldMaxDuration || profile.shotDurationRange.max}s
- Pattern Interrupt Cooldown: minimum ${profile.patternInterruptCooldownSeconds}s between interrupts
- Editorial Guidelines:
${profile.guidelines.map((g) => `  * ${g}`).join('\n')}

====================================================
3. COMPLETE SCRIPT & NARRATION TIMING
====================================================
Total Master Narration Audio Duration: ${input.narrationDurationSeconds.toFixed(2)}s
Complete Narration:
"${input.narrationText}"

Scene / Storyboard Structure:
${JSON.stringify(storyboardSummary || scenesSummary, null, 2)}

====================================================
4. B-ROLL CANDIDATE BOARD (AVAILABLE REAL ASSETS & VISUAL LOOKS)
====================================================
You MUST select candidate assets strictly from this board using their exact "id".
DO NOT invent candidate IDs that are not in this list.
Inspect the "visualLook", "composition", "movement", "lightingMood", "thumbnailUrl", and "previewUrl" for each candidate:
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
1. VISUAL LOOK & COMPOSITION INTELLIGENCE:
   - Evaluate the actual appearance ("visualLook", "composition", "movement", "lightingMood") of each candidate.
   - Do NOT just match keywords! Choose visuals whose emotional resonance and composition amplify the spoken words.
   - Shot 1 (The Hook): For short-form, ask: "Would this visual make someone stop scrolling?" Pick an asset with high novelty, unusual scale (e.g. macro or cosmic wide), or striking visual energy.
   - Visual Contrast: Create dynamic contrast between consecutive shots (e.g. cut from a tight macro close-up to a sweeping wide vista, or from calm observation to high visual energy).
2. TIMING & BOUNDS:
   - For every shot, specify inPoint and outPoint within the chosen asset's durationSeconds.
   - durationSeconds MUST equal (outPoint - inPoint).
   - inPoint must be >= 0. outPoint must be <= candidate.durationSeconds.
   - The SUM of durationSeconds across ALL decisions MUST equal EXACTLY ${input.targetDurationSeconds.toFixed(2)}s.
3. FORMAT-SPECIFIC EDITORIAL PACING:
   ${
     profile.format === 'short'
       ? `- SHORT-FORM: Rapid, dynamic curiosity-driven cuts (${profile.shotDurationRange.min}s - ${profile.shotDurationRange.max}s). Opening hook MUST be <= ${profile.hookDurationMax}s. Frequent meaningful visual changes without arbitrary cuts. Retention-first animated captions.`
       : `- LONG-FORM: Structured chapter progression with thoughtful visual holds up to ${profile.visualHoldMaxDuration}s when narrating complex concepts. Wide visual resets at chapter transitions. Restrained captions and pattern interrupts for a cinematic viewing experience.`
   }
4. ANTI-REPETITION & CONTINUITY SAFEGUARDS:
   - NEVER select the exact same candidate asset in two consecutive shots.
   - Do NOT use the exact same composition (e.g. 3 wide shots) consecutively if alternatives exist.
   - Limit runs of the same provider to maintain visual diversity.
   - If reusing an asset later in the video, pick a non-overlapping time range (e.g. [0s, 2.5s] -> [3.0s, 5.5s]).

====================================================
7. REQUIRED JSON RESPONSE SCHEMA
====================================================
Respond ONLY with a JSON object matching this schema:
{
  "totalDurationSeconds": ${input.targetDurationSeconds.toFixed(2)},
  "format": "${profile.format}",
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
      "visualDescription": "MACRO view of microchip circuit pathways with blue laser pulses",
      "visualContrastNote": "Cuts from tight macro sensor to sweeping wide nebula",
      "pacingWeight": 1.2
    }
  ]
}
`.trim();
  }
}
