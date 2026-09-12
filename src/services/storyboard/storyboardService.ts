import { GeminiClient } from '../gemini/client';
import { PipelineLogger } from '../logging/logger';
import { StoryboardValidator } from './validator';
import { DeterministicStoryboardEngine } from './fallback';
import { Storyboard, StoryboardInput } from '../../types/storyboard';
import { VideoFormat } from '../../types/editorial';

export interface AIStoryboardServiceOptions {
  geminiClient?: GeminiClient;
  deterministicEngine?: DeterministicStoryboardEngine;
  validator?: StoryboardValidator;
  logger?: PipelineLogger;
}

export class AIStoryboardService {
  private gemini: GeminiClient;
  private deterministicEngine: DeterministicStoryboardEngine;
  private validator: StoryboardValidator;
  private logger?: PipelineLogger;

  constructor(options: AIStoryboardServiceOptions = {}) {
    this.gemini = options.geminiClient || new GeminiClient();
    this.deterministicEngine = options.deterministicEngine || new DeterministicStoryboardEngine();
    this.validator = options.validator || new StoryboardValidator();
    this.logger = options.logger;
  }

  /**
   * Generates a structured AI storyboard from the script and measured narration timing.
   * Uses ONE Gemini call per video with deterministic validation and fail-safe fallback.
   */
  async generateStoryboard(input: StoryboardInput): Promise<Storyboard> {
    const format: VideoFormat = input.format === 'long' ? 'long' : 'short';
    const duration = input.narrationDurationSeconds;

    this.logger?.stage(
      'STORYBOARD',
      `AI Storyboard: Generating visual beat storyboard for ${format.toUpperCase()} video (${duration.toFixed(2)}s audio)`
    );

    if (this.gemini.isAvailable()) {
      try {
        const prompt = this.buildStoryboardPrompt(input, format);
        this.logger?.info(`Dispatching AI Storyboard prompt to Gemini (${prompt.length} chars)...`);

        const rawResponse = await this.gemini.generateJson<any>(prompt);
        const validatedStoryboard = this.validator.validateAndSanitize(rawResponse, input);

        if (validatedStoryboard && validatedStoryboard.shots.length > 0) {
          const issues = this.validator.getIssues();
          if (issues.length > 0) {
            this.logger?.info(
              `AI Storyboard sanitized with ${issues.length} adjustments: ${issues.map((i) => i.actionTaken).slice(0, 3).join('; ')}`
            );
          }

          this.logger?.info(
            `AI Storyboard generated successfully: ${validatedStoryboard.shots.length} visual shots spanning ${validatedStoryboard.totalDurationSeconds.toFixed(2)}s`
          );
          return validatedStoryboard;
        }

        this.logger?.warn(
          'AI Storyboard output failed structural validation. Falling back to deterministic storyboard engine.'
        );
      } catch (err) {
        this.logger?.warn(
          `AI Storyboard Gemini generation failed (${(err as Error).message}). Executing deterministic fallback.`
        );
      }
    } else {
      this.logger?.info(
        'Gemini is unavailable or unconfigured for AI Storyboard. Using deterministic storyboard engine.'
      );
    }

    // Safe, guaranteed fallback to the deterministic engine
    const fallbackStoryboard = this.deterministicEngine.generateStoryboard(input);
    this.logger?.info(
      `Deterministic storyboard generated: ${fallbackStoryboard.shots.length} visual shots spanning ${fallbackStoryboard.totalDurationSeconds.toFixed(2)}s`
    );
    return fallbackStoryboard;
  }

  /**
   * Builds the comprehensive prompt for Gemini to generate the structured visual storyboard.
   */
  private buildStoryboardPrompt(input: StoryboardInput, format: VideoFormat): string {
    const scenesText = input.script.scenes
      .map(
        (s) =>
          `[Scene ${s.index}]\nNarration: "${s.narration}"\nKeywords: ${(s.suggestedKeywords || []).join(', ')}`
      )
      .join('\n\n');

    const minShotDur = format === 'long' ? '1.5s' : '0.8s';
    const maxShotDur = format === 'long' ? '7.0s' : '4.2s';
    const targetShotCount = format === 'long' ? '15-30 shots' : '8-14 shots';

    return `You are a world-class Visual Storyboard Director and Cinematographer specializing in high-retention vertical short-form and documentary video.

Your task is to transform a spoken narration script into a structured visual storyboard.

## Ground Truth Timing & Format
- Total Authoritative Audio Duration: ${input.narrationDurationSeconds.toFixed(2)} seconds
- Video Format: ${format.toUpperCase()} (Target: ${targetShotCount}, shot duration bounds: ${minShotDur} to ${maxShotDur})
- Total Scenes: ${input.script.scenes.length}

## Script & Narration:
Title: "${input.script.title || 'Untitled'}"
Hook: "${input.script.hook || ''}"

${scenesText}

## Storyboarding Directives:
1. **Story-Driven Visual Beats (NOT strictly sentence splits)**:
   - Break the narrative into visual shots based on emotional changes, subject shifts, conceptual reveals, and dramatic escalation.
   - **Multi-shot narration clauses**: When a single narration sentence or clause describes intense action, contrast, or scale (e.g. "A dead star spinning 700 times a second, packing the mass of the Sun into a city"), split it into multiple visual shots (e.g. Shot 1: Wide establishing magnetar spinning; Shot 2: Extreme close-up of city-scale diameter).
   - **Multi-clause shots**: When consecutive short or connective clauses occur (e.g. "Look closer. Listen carefully."), group them into ONE continuous visual shot to maintain clean visual continuity.
2. **Every shot MUST contain these exact 12 metadata fields**:
   - shotId: Unique string (e.g. "shot_0", "shot_1")
   - narrationStart: Number in seconds from 0.00
   - narrationEnd: Number in seconds up to ${input.narrationDurationSeconds.toFixed(2)}
   - narrationClause: The specific words spoken during this shot
   - visualSubject: Concrete physical entity, actor, or object in focus (e.g. "Massive radio telescope dish", "Spinning neutron star with plasma arcs")
   - action: What is physically happening or moving in the frame
   - environment: Setting, background, lighting, and atmosphere
   - emotion: Mood / tone (e.g. "electrifying curiosity", "scientific tension", "cosmic awe", "dread")
   - framing: Camera composition ("extreme close-up", "macro core", "wide establishing", "low-angle dramatic", "medium hero")
   - cameraMovement: Camera motion intent ("rapid push in", "slow orbital tracking", "dynamic pull out", "static tension")
   - visualPurpose: Editorial purpose ("hook_grab", "mystery_escalation", "mechanism_explanation", "scale_contrast", "payoff", "closing_call")
   - visualPriority: "critical" | "high" | "medium" | "supporting"
   - preferredVisualType: "stock" | "custom" | "graphic" | "typography"
   - searchQueries: Array of 2 to 4 high-signal, specific search queries optimized for stock video providers (Pexels/Pixabay). AVOID generic terms like "video", "4k", "background", "clip". Use specific noun+action phrases (e.g. ["radio telescope starry sky", "observatory night dish", "astronomy telescope cosmos"]).
3. **Continuous Timing Coverage**:
   - The first shot MUST start at 0.00.
   - Every shot's narrationStart must match the previous shot's narrationEnd.
   - The final shot's narrationEnd MUST equal ${input.narrationDurationSeconds.toFixed(2)}.

## Expected JSON Schema:
Respond ONLY with valid, raw JSON:
{
  "title": "${input.script.title || 'AI Storyboard'}",
  "totalDurationSeconds": ${input.narrationDurationSeconds.toFixed(2)},
  "format": "${format}",
  "pacingSummary": "Brief overview of visual cadence and narrative arc",
  "visualThemes": ["space astronomy", "neutron star", "cosmic radiation"],
  "shots": [
    {
      "shotId": "shot_0",
      "sceneIndex": 0,
      "shotIndex": 0,
      "narrationStart": 0.0,
      "narrationEnd": 2.2,
      "narrationClause": "Opening hook line",
      "visualSubject": "Parabolic radio telescope array under starlight",
      "action": "Dishes pivoting slowly toward the deep cosmos",
      "environment": "High-altitude desert observatory beneath the Milky Way",
      "emotion": "electrifying curiosity and suspense",
      "framing": "low-angle dramatic wide",
      "cameraMovement": "slow forward push in",
      "visualPurpose": "hook_grab",
      "visualPriority": "critical",
      "preferredVisualType": "stock",
      "searchQueries": ["radio telescope starry night", "astronomical observatory night sky", "deep space antenna"]
    }
  ]
}`;
  }
}
