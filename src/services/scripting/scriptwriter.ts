import { ResearchArtifact, ScriptArtifact, ScriptBeat } from '../../contracts/artifacts';
import { GeminiClient } from '../gemini/client';
import { PipelineLogger } from '../logging/logger';

export class ScriptEngine {
  constructor(private gemini: GeminiClient, private logger: PipelineLogger) {}

  public async generateScript(
    research: ResearchArtifact,
    targetDurationSec: number = 24,
    allowFallback = true
  ): Promise<ScriptArtifact> {
    this.logger.stageStart('script', `Target Duration: ${targetDurationSec}s, Topic: "${research.topic}"`);

    // Standard conversational reading pace: ~2.5 to 2.8 words per second (~150-165 WPM)
    const targetWordCount = Math.round(targetDurationSec * 2.6);

    const prompt = `Transform this scientific research into a retention-optimized, spoken narration script for a ${targetDurationSec}-second short-form vertical video.
Topic: "${research.topic}"
Target Word Count: ~${targetWordCount} words.

RESEARCH FACTS:
${research.keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

CHRONOLOGY:
${research.chronology.map((c) => `Step ${c.step}: ${c.title} - ${c.description}`).join('\n')}

RULES FOR SPOKEN SCRIPT:
1. "hook": Start with an immediate punchy question or mind-blowing statement. NO greetings (no "Hey guys", "Welcome back", etc.).
2. Break the narration into 3 to 5 discrete narrative beats ("spokenLines").
3. Each beat must have:
   - "index": integer starting at 1
   - "text": 1-2 punchy, short, spoken sentences (no tongue-twisters, highly conversational)
   - "emotion": e.g. "curious", "dramatic", "wonder", "intense"
   - "visualBeat": brief instruction of what should be shown during this line
4. Build narrative tension: Hook -> Escalation / Mystery -> The Critical Turning Point -> Astounding Climax / Takeaway.
5. Total word count must be between ${Math.round(targetWordCount * 0.8)} and ${Math.round(targetWordCount * 1.15)} words.`;

    const systemInstruction = `You are an elite short-form scriptwriter and pacing editor. You craft punchy scripts that hold retention from second 0 to the final frame. Output strict JSON.`;

    if (this.gemini.isAvailable()) {
      try {
        const raw = await this.gemini.generateStructuredContent<any>(
          prompt,
          systemInstruction,
          '{ topic, hook, spokenLines: [{ index, text, emotion, visualBeat }] }'
        );

        const validated = this.validateScript(research.topic, targetDurationSec, raw);
        this.logger.stageCompleted('script', `${validated.spokenLines.length} beats, ~${validated.totalWordCount} words, est. ${validated.estimatedDurationSec.toFixed(1)}s`);
        return validated;
      } catch (err: any) {
        this.logger.stageError('script', err);
        if (!allowFallback) throw err;
        this.logger.warn('script', 'Using structured script fallback due to Gemini error.');
      }
    } else {
      if (!allowFallback) {
        throw new Error('Gemini API key is required for script generation, and fallback is disabled.');
      }
      this.logger.info('script', 'Gemini API not configured; using deterministic script generator.');
    }

    const fallback = this.generateFallbackScript(research, targetDurationSec);
    this.logger.stageCompleted('script', `${fallback.spokenLines.length} beats, ~${fallback.totalWordCount} words (fallback mode)`);
    return fallback;
  }

  private validateScript(topic: string, targetDurationSec: number, data: any): ScriptArtifact {
    if (!data || typeof data !== 'object') {
      throw new Error('Script response must be an object.');
    }

    const hook = typeof data.hook === 'string' && data.hook.trim().length > 0
      ? data.hook.trim()
      : `Have you ever wondered what really happens with ${topic}?`;

    let spokenLines: ScriptBeat[] = [];
    if (Array.isArray(data.spokenLines) && data.spokenLines.length > 0) {
      spokenLines = data.spokenLines.map((line: any, idx: number) => {
        const text = String(line.text || '').trim();
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const estimatedSec = Math.max(2.0, Number((wordCount / 2.6).toFixed(1)));
        return {
          index: typeof line.index === 'number' ? line.index : idx + 1,
          text: text || `Exploring the incredible physics of ${topic}.`,
          emotion: String(line.emotion || 'dramatic'),
          estimatedDurationSec: estimatedSec,
          visualBeat: String(line.visualBeat || 'Cinematic footage illustrating narration'),
        };
      });
    }

    if (spokenLines.length === 0) {
      spokenLines = [
        {
          index: 1,
          text: hook,
          emotion: 'curious',
          estimatedDurationSec: 3.5,
          visualBeat: 'Dramatic opening visual hook',
        },
        {
          index: 2,
          text: `When ${topic} unfolds, astronomical forces unleash unfathomable energy across deep space.`,
          emotion: 'intense',
          estimatedDurationSec: 5.5,
          visualBeat: 'Intense cosmic energy reactions',
        },
        {
          index: 3,
          text: `The remnants scatter across the cosmos, seeding the very elements that make life possible.`,
          emotion: 'wonder',
          estimatedDurationSec: 6.0,
          visualBeat: 'Glowing particles and expanding nebula',
        },
      ];
    }

    const fullText = spokenLines.map((l) => l.text).join(' ');
    const totalWordCount = fullText.split(/\s+/).filter(Boolean).length;
    const estimatedDurationSec = Number((totalWordCount / 2.6).toFixed(1));

    return {
      topic,
      hook,
      spokenLines,
      fullText,
      totalWordCount,
      targetDurationSec,
      estimatedDurationSec,
      metadata: {
        model: this.gemini.isAvailable() ? 'gemini-3.8-flash' : 'fallback-generator',
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private generateFallbackScript(research: ResearchArtifact, targetDurationSec: number): ScriptArtifact {
    const topic = research.topic;
    const spokenLines: ScriptBeat[] = [
      {
        index: 1,
        text: `Did you know that ${topic} might be one of the most violent spectacles in the entire universe?`,
        emotion: 'curious',
        estimatedDurationSec: 4.5,
        visualBeat: 'Vast cosmic void and gathering gravitational forces',
      },
      {
        index: 2,
        text: `As matter is drawn past the point of no return, gravitational friction heats surrounding gas to millions of degrees.`,
        emotion: 'intense',
        estimatedDurationSec: 6.0,
        visualBeat: 'Swirling accretion vortex of blinding plasma',
      },
      {
        index: 3,
        text: `Tidal forces stretch entire stars into incandescent ribbons of plasma, before consuming them entirely.`,
        emotion: 'dramatic',
        estimatedDurationSec: 6.5,
        visualBeat: 'Cataclysmic stellar destruction and energy jet',
      },
      {
        index: 4,
        text: `What remains are radiant shockwaves that illuminate the dark cosmos for billions of light years.`,
        emotion: 'wonder',
        estimatedDurationSec: 5.5,
        visualBeat: 'Expanding shockwaves glowing across distant galaxies',
      },
    ];

    const fullText = spokenLines.map((l) => l.text).join(' ');
    const totalWordCount = fullText.split(/\s+/).filter(Boolean).length;
    const estimatedDurationSec = Number((totalWordCount / 2.6).toFixed(1));

    return {
      topic,
      hook: spokenLines[0].text,
      spokenLines,
      fullText,
      totalWordCount,
      targetDurationSec,
      estimatedDurationSec,
      metadata: {
        model: 'deterministic-offline-scriptwriter',
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
