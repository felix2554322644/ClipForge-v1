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

    const prompt = `You are an elite factual researcher for viral vertical videos.
Analyze the topic: "${topic}".
Return a JSON object with:
- "topic": string (the sanitized title)
- "hook": string (an arresting, attention-grabbing opening sentence)
- "coreAngle": string (the compelling narrative perspective)
- "keyFacts": array of 3-4 mindblowing facts
- "visualThemes": array of 4-6 search keywords representing striking visual footage
- "recommendedPacing": "fast" | "moderate" | "dramatic"`;

    const brief = await this.gemini.generateJson<ResearchBrief>(prompt, () => {
      this.logger.warn(`Using deterministic research brief fallback for "${topic}".`);
      return {
        topic,
        hook: `Discover the incredible story behind ${topic}.`,
        coreAngle: `A deep dive exploring ${topic} and why it matters.`,
        keyFacts: [
          `Fascinating developments and discoveries have shaped our understanding of ${topic}.`,
          `Surprising details make ${topic} one of the most intriguing subjects today.`,
          `Modern research continues to uncover new dimensions about ${topic}.`
        ],
        visualThemes: [topic.toLowerCase(), 'cinematic nature', 'science exploration', 'technology'],
        recommendedPacing: 'fast'
      };
    });

    this.logger.info(`Research brief synthesized for "${brief.topic}"`);
    return brief;
  }
}
