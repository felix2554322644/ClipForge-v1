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

export interface VisualGroundingOptions {
  maxThumbnailCandidates?: number;
  fetchTimeoutMs?: number;
  logger?: PipelineLogger;
}

export class VisualGroundingService {
  private maxThumbnailCandidates: number;
  private fetchTimeoutMs: number;
  private logger?: PipelineLogger;

  constructor(options: VisualGroundingOptions = {}) {
    this.maxThumbnailCandidates = options.maxThumbnailCandidates || 16;
    this.fetchTimeoutMs = options.fetchTimeoutMs || 3000;
    this.logger = options.logger;
  }

  /**
   * Acquires lightweight thumbnail image frame for a single candidate asset.
   * Supports data URIs, HTTP/HTTPS URLs, local file paths, and cached assets.
   */
  async acquireCandidateFrame(
    candidate: CandidateBrollAsset
  ): Promise<{ base64: string; mimeType: string } | undefined> {
    // 1. Already has base64
    if (candidate.thumbnailBase64) {
      return {
        base64: candidate.thumbnailBase64,
        mimeType: candidate.thumbnailMimeType || 'image/jpeg',
      };
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
        return { base64: match[2], mimeType: match[1] };
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
        return { base64, mimeType };
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
            return { base64, mimeType };
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
   * Acquires thumbnail frames across all candidates on the board concurrently.
   */
  async acquireFramesForCandidateBoard(candidateBoard: BrollCandidateBoard): Promise<number> {
    const candidates = candidateBoard.candidates.slice(0, this.maxThumbnailCandidates);
    let acquiredCount = 0;

    const results = await Promise.allSettled(
      candidates.map(async (c) => {
        const res = await this.acquireCandidateFrame(c);
        if (res) acquiredCount++;
      })
    );

    this.logger?.info(
      `Visual Grounding: Acquired ${acquiredCount}/${candidates.length} candidate thumbnail frames for multimodal evaluation`
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
5. MULTIMODAL VISUAL GROUNDING RULES & PIXEL EVALUATION
====================================================
1. EVALUATE THE ACTUAL VISUAL PIXELS:
   - For every candidate with an image frame above, evaluate the real visible subjects, environment, lighting, and framing.
   - REJECT MISLEADING KEYWORD MATCHES: If a candidate matched tags for "neutron star" or "black hole" but the actual image is a cartoon, abstract icon, or unrelated city scene, DO NOT select it for that shot.
   - VISUAL TRUTH OVER METADATA: A candidate with striking, authentic, and semantically accurate imagery MUST beat a candidate that only has keyword matches.
2. STORYBOARD VISUAL BEAT ALIGNMENT:
   - Match candidate visuals to the storyboard's visual beat intent:
     * Shot 1 (Opening Hook): Must feature arresting, high-curiosity imagery that immediately stops scrolling.
     * Scientific/Mechanism shots: Must show authentic astrophysical phenomena, high-tech instruments, or accurate macro/cosmic scales.
     * Escalation/Climax shots: Must exhibit high visual energy, dynamic lighting, or dramatic movement.
3. TIMING & DURATION CONTINUITY:
   - For every shot, specify inPoint and outPoint within the chosen asset's durationSeconds.
   - durationSeconds MUST equal (outPoint - inPoint).
   - The SUM of durationSeconds across ALL decisions MUST equal EXACTLY ${input.targetDurationSeconds.toFixed(2)}s.
4. STRICT ASSET ID INTEGRITY:
   - You MUST select candidate assets strictly using their exact "id" from the candidate board above.
   - NEVER invent candidate IDs.

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
      "pacingWeight": 1.2
    }
  ]
}
`.trim();

    parts.push({ text: instructionsText });

    return parts;
  }
}
