import fs from 'node:fs';
import path from 'node:path';
import {
  CandidateBrollAsset,
  BrollCandidateBoard,
  NicheProfile,
  FormatEditorialProfile,
  AIDirectorInput,
} from '../../types/editorial';
import { GeminiPart } from '../gemini/client';
import { PipelineLogger } from '../logging/logger';
import { VisualIntelligenceService } from './visualIntelligence';
import { GeminiUsageGovernor, getGlobalGovernor } from '../governor/usageGovernor';
import { CONFIG } from '../../config/index';

export interface VisualGroundingOptions {
  maxThumbnailCandidates?: number;
  fetchTimeoutMs?: number;
  logger?: PipelineLogger;
  governor?: GeminiUsageGovernor;
}

export class VisualGroundingService {
  private maxThumbnailCandidates: number;
  private fetchTimeoutMs: number;
  private logger?: PipelineLogger;
  private governor: GeminiUsageGovernor;

  // In-run cache for candidate frames to prevent re-fetching or re-evaluating duplicate assets
  private static runFrameCache = new Map<string, { base64: string; mimeType: string }>();

  constructor(options: VisualGroundingOptions = {}) {
    this.governor = options.governor || getGlobalGovernor();
    this.maxThumbnailCandidates =
      options.maxThumbnailCandidates ||
      this.governor.getLimits().maxCandidateEvaluations ||
      CONFIG.CLIPFORGE_MAX_CANDIDATE_EVALUATIONS;
    this.fetchTimeoutMs = options.fetchTimeoutMs || 3000;
    this.logger = options.logger;
  }

  /**
   * Clears the static run frame cache (useful across separate test runs)
   */
  public static clearRunCache(): void {
    VisualGroundingService.runFrameCache.clear();
  }

  public static clearFrameCache(): void {
    VisualGroundingService.clearRunCache();
  }

  /**
   * Acquires lightweight thumbnail image frame for a single candidate asset.
   * Supports data URIs, HTTP/HTTPS URLs, local file paths, and cached assets.
   */
  async acquireCandidateFrame(
    candidate: CandidateBrollAsset
  ): Promise<{ base64: string; mimeType: string } | undefined> {
    const cacheKey = candidate.id || candidate.providerAssetId || candidate.thumbnailUrl || '';

    // 0. Check in-run cache
    if (cacheKey && VisualGroundingService.runFrameCache.has(cacheKey)) {
      const cached = VisualGroundingService.runFrameCache.get(cacheKey)!;
      candidate.thumbnailBase64 = cached.base64;
      candidate.thumbnailMimeType = cached.mimeType;
      return cached;
    }

    // 1. Already has base64
    if (candidate.thumbnailBase64) {
      const res = {
        base64: candidate.thumbnailBase64,
        mimeType: candidate.thumbnailMimeType || 'image/jpeg',
      };
      if (cacheKey) VisualGroundingService.runFrameCache.set(cacheKey, res);
      return res;
    }

    const sourceUrl = candidate.thumbnailUrl || candidate.previewUrl;
    if (!sourceUrl) {
      return undefined;
    }

    // 2. Data URL
    if (sourceUrl.startsWith('data:image/')) {
      const match = sourceUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (match) {
        candidate.thumbnailMimeType = match[1];
        candidate.thumbnailBase64 = match[2];
        const res = { base64: match[2], mimeType: match[1] };
        if (cacheKey) VisualGroundingService.runFrameCache.set(cacheKey, res);
        return res;
      }
    }

    // 3. Local file path
    if (fs.existsSync(sourceUrl)) {
      try {
        const ext = path.extname(sourceUrl).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';

        const buffer = fs.readFileSync(sourceUrl);
        const base64 = buffer.toString('base64');
        candidate.thumbnailBase64 = base64;
        candidate.thumbnailMimeType = mimeType;
        const res = { base64, mimeType };
        if (cacheKey) VisualGroundingService.runFrameCache.set(cacheKey, res);
        return res;
      } catch (err) {
        this.logger?.warn(`Failed to read local thumbnail file ${sourceUrl}: ${(err as Error).message}`);
      }
    }

    // 4. Remote HTTP/HTTPS URL
    if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

        const res = await fetch(sourceUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'aistudio-build',
            Accept: 'image/jpeg, image/png, image/webp, image/*',
          },
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          const contentType = res.headers.get('content-type') || 'image/jpeg';
          const mimeType = contentType.includes('png')
            ? 'image/png'
            : contentType.includes('webp')
            ? 'image/webp'
            : 'image/jpeg';

          const arrayBuf = await res.arrayBuffer();
          const base64 = Buffer.from(arrayBuf).toString('base64');

          // Ensure the image data is not empty
          if (base64.length > 50) {
            candidate.thumbnailBase64 = base64;
            candidate.thumbnailMimeType = mimeType;
            const finalRes = { base64, mimeType };
            if (cacheKey) VisualGroundingService.runFrameCache.set(cacheKey, finalRes);
            return finalRes;
          }
        }
      } catch (err) {
        // Graceful non-blocking error handling
        this.logger?.warn(`Thumbnail fetch skipped for ${candidate.id} (${(err as Error).message})`);
      }
    }

    return undefined;
  }

  /**
   * Acquires thumbnail frames across candidates on the board, strictly bounded by the
   * governor's candidate evaluation limit (max 12 evaluations).
   */
  async acquireFramesForCandidateBoard(candidateBoard: BrollCandidateBoard): Promise<number> {
    const maxAllowed = Math.min(
      this.maxThumbnailCandidates,
      this.governor.getLimits().maxCandidateEvaluations
    );

    // Filter to valid stock candidates (excluding procedural which have synthetic SVG/procedural renderers)
    const eligibleCandidates = candidateBoard.candidates
      .filter((c) => c.provider !== 'procedural')
      .slice(0, maxAllowed);

    let acquiredCount = 0;

    for (const c of eligibleCandidates) {
      if (this.governor.hasCandidateBeenEvaluated(c.id)) {
        // Already evaluated in this run, fetch from cache without burning new evaluation count
        const cached = await this.acquireCandidateFrame(c);
        if (cached) acquiredCount++;
        continue;
      }

      if (!this.governor.canEvaluateCandidate(c.id)) {
        this.logger?.info?.(
          `[GOVERNOR] Candidate multimodal evaluation limit reached (${this.governor.getStats().candidateEvaluations}/${this.governor.getLimits().maxCandidateEvaluations}). Skipping thumbnail for ${c.id}`
        );
        break;
      }

      const res = await this.acquireCandidateFrame(c);
      if (res) {
        acquiredCount++;
        this.governor.recordCandidateEvaluation(c.id);
      }
    }

    this.logger?.info?.(
      `Visual Grounding: Acquired and evaluated ${acquiredCount} candidate thumbnail frames (Governor evaluations: ${this.governor.getStats().candidateEvaluations}/${this.governor.getLimits().maxCandidateEvaluations})`
    );

    return acquiredCount;
  }

  /**
   * Builds multimodal contents (Text + Inline Image Parts) for the single AI Director Gemini pass.
   */
  buildMultimodalContents(
    input: AIDirectorInput,
    niche: NicheProfile,
    profile: FormatEditorialProfile
  ): GeminiPart[] {
    const parts: GeminiPart[] = [];

    // Header context text
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

    const introText = `
You are the AI Editorial Director of ClipForge, an autonomous, retention-first video engine.
Your mission is to make the high-level creative editorial and directing decisions for this video in ONE structured pass, grounding your decisions in the ACTUAL VISUAL CONTENT (real image pixels) of candidate footage.

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

Scene / Storyboard Visual Beats:
${JSON.stringify(storyboardSummary || scenesSummary, null, 2)}

====================================================
4. CANDIDATE ASSETS FOR MULTIMODAL VISUAL EVALUATION
====================================================
Below are the candidate B-roll assets available on the Candidate Board.
Examine each candidate's ACTUAL IMAGE FRAME and metadata:
`.trim();

    parts.push({ text: introText });

    // Multimodal Candidate Parts (Image + compact metadata)
    for (let i = 0; i < input.candidateBoard.candidates.length; i++) {
      const c = input.candidateBoard.candidates[i];
      const vis = c.visualReference || VisualIntelligenceService.evaluateVisualReference(c);

      const candidateIntro = `\n--- Candidate #${i + 1} [ID: ${c.id}] (Provider: ${c.provider}, Query: "${c.queryUsed}") ---\n`;
      parts.push({ text: candidateIntro });

      if (c.thumbnailBase64) {
        parts.push({
          inlineData: {
            mimeType: c.thumbnailMimeType || 'image/jpeg',
            data: c.thumbnailBase64,
          },
        });
      }

      const candidateMeta = `Metadata for [${c.id}]:
- Dimensions: ${c.width}x${c.height} (${c.nativeVertical ? 'Native Vertical' : 'Landscape Reframed'})
- Duration: ${c.durationSeconds.toFixed(1)}s
- Tags: [${c.tags.slice(0, 6).join(', ')}]
- Visual Metadata: ${vis.visualDescription}
- Intended Shot/Scene: ${c.targetShotId || (c.targetSceneIndex !== undefined ? `Scene ${c.targetSceneIndex}` : 'Any')}
`;
      parts.push({ text: candidateMeta });
    }

    // Concluding instructions with Multimodal Pixel Grounding rules
    const instructionsText = `
====================================================
5. MULTIMODAL VISUAL GROUNDING & CREATIVE DECISION RULES
====================================================
1. EVALUATE THE ACTUAL VISUAL PIXELS:
   - For every candidate with an image frame above, evaluate the real visible subjects, environment, lighting, and framing.
   - REJECT MISLEADING KEYWORD MATCHES: If a candidate matched tags for a concept but the actual image is irrelevant, cartoonish, low-quality, or misleading, DO NOT select it.
   - VISUAL TRUTH OVER METADATA: A candidate with striking, authentic, and semantically accurate imagery MUST beat a candidate that only has keyword matches.
2. STORYBOARD VISUAL BEAT ALIGNMENT & CREATIVE FREEDOM:
   For every visual beat / shot, you have full creative authority:
   - ACCEPT/SELECT: If a candidate is compelling and conveys the concept, set "action": "SELECT", "selectedCandidateId": "EXACT_ID".
   - REJECT & CUSTOM VISUAL: If stock footage cannot communicate the concept (e.g. abstract scientific statistics, comparisons, code, key takeaways, or typography), set "action": "USE_CUSTOM_VISUAL" (or "visualType": "custom") with "customSceneParams":
     * Supported types: "kinetic_typography", "statistic_card", "timeline_steps", "comparison_split", "feature_callout", "quote_card", "countdown", "icon_badge", "terminal_code".
   - REJECT & SEARCH AGAIN: If the concept should be real footage but all current candidates fail to convey it, set "action": "SEARCH_AGAIN" and provide "newSearchQueries": ["improved query 1", "improved query 2"].
3. TIMING & DURATION CONTINUITY:
   - For every shot, specify inPoint and outPoint within the chosen asset's durationSeconds.
   - durationSeconds MUST equal (outPoint - inPoint).
   - The SUM of durationSeconds across ALL decisions MUST equal EXACTLY ${input.targetDurationSeconds.toFixed(2)}s.
4. STRICT ASSET ID INTEGRITY:
   - For selected stock footage, select strictly using its exact "id" from the candidate board.

====================================================
6. REQUIRED JSON RESPONSE SCHEMA
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
      "action": "SELECT",
      "selectedCandidateId": "EXACT_ID_FROM_CANDIDATE_BOARD",
      "narrationClause": "Clause or sentence segment spoken during this shot",
      "inPoint": 0.0,
      "outPoint": 3.0,
      "durationSeconds": 3.0,
      "role": "hook",
      "motionEffect": "punch_in",
      "motionIntensity": "dramatic",
      "cropMode": "standard",
      "transition": "cut",
      "captionTreatment": "hook_pop",
      "editorialReason": "Visual grounding shows authentic high-energy spinning stellar plasma",
      "visualDescription": "High-contrast cosmic plasma burst with intense magnetic arcs",
      "visualType": "stock",
      "customSceneParams": null,
      "pacingWeight": 1.2
    }
  ]
}
`.trim();

    parts.push({ text: instructionsText });

    return parts;
  }
}
