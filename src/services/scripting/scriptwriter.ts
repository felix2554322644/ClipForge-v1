import { GeminiClient } from '../gemini/client';
import { ResearchBrief, ScriptOutput } from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';

export class ScriptwriterService {
  constructor(
    private gemini: GeminiClient,
    private logger: PipelineLogger
  ) {}

  async generateScript(brief: ResearchBrief): Promise<ScriptOutput> {
    this.logger.stage('SCRIPTING', `Drafting Everyday Curiosity video script`);

    const prompt = `You are a world-class documentary scriptwriter for high-retention 30-45 second vertical videos (YouTube Shorts / TikTok / Reels).
Niche: Everyday Curiosity — the hidden reasons behind ordinary things.
Core promise: Reveal the surprising, useful, and genuinely interesting reasons behind things people see, use, or experience every day.
Viewer sentiment: "I've seen this my whole life, but I never knew why."

Given this research brief:
${JSON.stringify(brief, null, 2)}

Structure the video as a curiosity-driven mini-investigation:
HOOK (immediate curiosity gap showing the everyday subject) -> QUESTION -> INVESTIGATION (common misconception / closer look) -> DISCOVERY & EXPLANATION (how the engineering/physics mechanism works) -> REVEAL -> PAYOFF (satisfying practical takeaway).

STRICT SCRIPTING RULES:
1. Entertainment first, value as payoff.
2. Opening must immediately show/establish the everyday subject and create a curiosity gap. No long intros, no generic "Have you ever wondered" cliches, no logos, no "today we're going to...".
3. Use concrete objects, places, environments, processes, people, and real-world footage guidance.
4. Strictly ban generic filler stock footage descriptions (no "person thinking", no abstract neurons, no floating particles, no unrelated cinematic clips).
5. Ground every scene in factual, verifiable mechanics.
6. Write 3-4 tight narrative scenes (total 25-45 seconds).

Output format JSON:
{
  "title": string,
  "totalEstimatedSeconds": number,
  "scenes": [
    {
      "index": number,
      "narration": string,
      "visualDescription": string (concrete everyday physical objects, tools, hands, cross-section mechanisms),
      "suggestedKeywords": string[] (concrete search queries for real footage),
      "approxDurationSeconds": number
    }
  ]
}`;

    const script = await this.gemini.generateJson<ScriptOutput>(
      prompt,
      () => {
        this.logger.warn('Using deterministic Everyday Curiosity script generator fallback.');
        return {
          title: brief.topic,
          totalEstimatedSeconds: 24,
          scenes: [
            {
              index: 0,
              narration: brief.hook || `If you look closely at ${brief.topic.toLowerCase()}, you'll notice a detail most people miss.`,
              visualDescription: 'Extreme close up macro shot of the everyday object revealing its subtle engineered feature.',
              suggestedKeywords: [brief.topic.toLowerCase(), 'everyday object close up', 'macro product detail'],
              approxDurationSeconds: 6,
            },
            {
              index: 1,
              narration: brief.keyFacts[0] || 'Most people assume it is just decorative, but it is actually a critical mechanical solution.',
              visualDescription: 'Hands holding and examining the object, demonstrating how it interacts with real environments.',
              suggestedKeywords: ['hands holding object', 'engineering mechanism demonstration', 'product in use'],
              approxDurationSeconds: 6,
            },
            {
              index: 2,
              narration: brief.keyFacts[1] || 'Without this hidden feature, everyday pressure and wear would cause catastrophic failure.',
              visualDescription: 'Detailed physical breakdown or cross-section showing how internal forces and air pressure are balanced.',
              suggestedKeywords: ['mechanical engineering cross section', 'industrial design test', 'object durability'],
              approxDurationSeconds: 6,
            },
            {
              index: 3,
              narration: brief.keyFacts[2] || `Next time you encounter it, you'll know the genius engineering making it work.`,
              visualDescription: 'Confident everyday user operating the object smoothly with clear practical mastery.',
              suggestedKeywords: ['person using product successfully', 'modern everyday life', 'satisfying design practical use'],
              approxDurationSeconds: 6,
            }
          ]
        };
      },
      'script'
    );

    this.logger.info(`Generated script containing ${script.scenes.length} scenes.`);
    return script;
  }
}

