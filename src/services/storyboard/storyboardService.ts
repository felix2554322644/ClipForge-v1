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

        const rawResponse = await this.gemini.generateJson<any>(prompt, { operation: 'storyboard' });
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

    return `You are a world-class Visual Storyboard Director and Cinematographer specializing in high-retention Everyday Curiosity vertical videos (YouTube Shorts / TikTok / Reels).
Niche: Everyday Curiosity — the hidden reasons behind ordinary things.
Core promise: Reveal the surprising, useful, and genuinely interesting reasons behind things people see, use, or experience every day.
Viewer sentiment: "I've seen this my whole life, but I never knew why."

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
1. **Curiosity-Driven Mini-Investigation Arc**:
   - Structure visual beats along the narrative arc: HOOK -> QUESTION -> INVESTIGATION -> DISCOVERY -> EXPLANATION -> REVEAL -> PAYOFF.
   - Pacing is driven by information changes and visual reveals.
   - The opening shot MUST immediately show or establish the everyday subject and create an intense curiosity gap. No long intros or generic openings.
2. **Director Creative Decisions**:
   For every visual beat, decide:
   - What the viewer should see (concrete physical object, mechanism, hands, tool, environment).
   - Why that visual is needed (narrative purpose).
   - What information it communicates to the viewer.
   - What should be revealed now versus held for later in the investigation.
   - When real footage is appropriate ('stock') versus when a custom Remotion procedural visual is necessary ('custom') to show an internal cross-section, flow, or comparison.
3. **Strict Anti-Filler Directive**:
   - BAN generic filler stock footage, generic "person thinking" clips, floating neurons, abstract particles, and unrelated cinematic footage.
   - Use concrete objects, places, environments, processes, people, and real-world mechanisms.
4. **Visual Purpose Taxonomy**:
   Every shot's visualPurpose must be one of:
   - "establish" (instantly show the everyday object / environment)
   - "demonstrate" (hands or tools actively using or testing the object)
   - "explain" (revealing the physical mechanism or engineering principle)
   - "contrast" (comparing correct design vs what would happen without it)
   - "reveal" (the unexpected hidden feature or counter-intuitive fact)
   - "provide_evidence" (showing real-world tests, cross-sections, or physical proof)
   - "escalate_curiosity" (drilling deeper into the mechanical mystery)
   - "payoff" (practical everyday understanding and satisfying conclusion)
5. **Continuous Timing Coverage**:
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
  "visualThemes": ["everyday design", "mechanical detail", "real world object"],
  "shots": [
    {
      "shotId": "shot_0",
      "sceneIndex": 0,
      "shotIndex": 0,
      "narrationStart": 0.0,
      "narrationEnd": 2.2,
      "narrationClause": "Opening hook line",
      "visualSubject": "Extreme close up macro shot of the everyday object",
      "action": "Hands examining the subtle engineered feature",
      "environment": "Everyday real world setting with natural lighting",
      "emotion": "intense curiosity and intrigue",
      "framing": "extreme close-up macro",
      "cameraMovement": "slow dynamic push in",
      "visualPurpose": "establish",
      "visualPriority": "critical",
      "preferredVisualType": "stock",
      "searchQueries": ["airplane window hole close up", "airplane cabin window macro"]
    }
  ]
}`;
  }
}

