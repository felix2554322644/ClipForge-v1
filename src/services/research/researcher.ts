import { GeminiClient } from '../gemini/client';
import { ResearchBrief } from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';

export class ResearchService {
  constructor(
    private gemini: GeminiClient,
    private logger: PipelineLogger
  ) {}

  async conductResearch(topic: string): Promise<ResearchBrief> {
    this.logger.stage('RESEARCH', `Analyzing topic: "${topic}"`);

    const prompt = `You are an elite factual investigative researcher for viral Everyday Curiosity vertical videos (YouTube Shorts / TikTok / Reels).
Niche: Everyday Curiosity — the hidden reasons behind ordinary things.
Core promise: Reveal the surprising, useful, and genuinely interesting reasons behind things people see, use, or experience every day.
Viewer sentiment: "I've seen this my whole life, but I never knew why."

Analyze the topic: "${topic}".

Return a JSON object with:
- "topic": string (the sanitized title)
- "hook": string (an arresting, attention-grabbing opening observation or curiosity gap immediately establishing the everyday subject)
- "coreAngle": string (the mini-investigative narrative angle explaining the hidden design, physics, or engineering mechanism)
- "keyFacts": array of 3-4 verifiable, concrete factual explanations (how the mechanism works, why alternative designs fail, the practical payoff)
- "visualThemes": array of 4-6 search keywords representing concrete real-world objects, hands interacting, engineering cross-sections, and real environments
- "recommendedPacing": "fast" | "moderate" | "dramatic"`;

    const brief = await this.gemini.generateJson<ResearchBrief>(
      prompt,
      () => {
        this.logger.warn(`Using deterministic research brief fallback for "${topic}".`);
        return {
          topic,
          hook: `You've probably noticed ${topic.toLowerCase()}, but almost nobody knows why it's actually there.`,
          coreAngle: `A miniature engineering investigation into the hidden mechanism behind ${topic.toLowerCase()}.`,
          keyFacts: [
            `The design is an intentional mechanical solution engineered to solve a specific physical problem.`,
            `Without this critical feature, standard everyday use would cause structural failure or dangerous pressure build-up.`,
            `The mechanism works silently every day through clever geometry and physical principles.`,
          ],
          visualThemes: [
            topic.toLowerCase(),
            'everyday object close up',
            'mechanical engineering demonstration',
            'real world hands using object',
          ],
          recommendedPacing: 'fast',
        };
      },
      'research'
    );

    this.logger.info(`Research brief synthesized for "${brief.topic}"`);
    return brief;
  }
}

