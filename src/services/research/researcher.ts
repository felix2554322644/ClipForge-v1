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
      this.logger.warn('Using deterministic research brief fallback.');
      return {
        topic,
        hook: `Billions of light years away, incomprehensible cosmic signals are hitting Earth right now.`,
        coreAngle: `Unraveling the mystery of millisecond-duration fast radio bursts that outshine entire galaxies.`,
        keyFacts: [
          `Fast radio bursts release as much energy in a millisecond as our Sun radiates in days.`,
          `Most FRBs flash just once and vanish forever, but magnetars are emerging as prime suspects.`,
          `Astronomers use massive radio dish arrays across continents to pinpoint their home galaxies.`
        ],
        visualThemes: ['deep space galaxy', 'radio telescope dish', 'pulsar neutron star', 'cosmic explosion'],
        recommendedPacing: 'fast'
      };
    });

    this.logger.info(`Research brief synthesized for "${brief.topic}"`);
    return brief;
  }
}
