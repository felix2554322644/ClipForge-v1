import { GeminiClient } from '../gemini/client';
import { ResearchBrief, ScriptOutput } from '../../types/pipeline';
import { PipelineLogger } from '../logging/logger';

export class ScriptwriterService {
  constructor(
    private gemini: GeminiClient,
    private logger: PipelineLogger
  ) {}

  async generateScript(brief: ResearchBrief): Promise<ScriptOutput> {
    this.logger.stage('SCRIPTING', `Drafting vertical video script`);

    const prompt = `You are a world-class documentary scriptwriter for 30-45 second vertical videos.
Given this research brief:
${JSON.stringify(brief, null, 2)}

Write a high-retention, 3-scene script.
Rules:
- Scene 0 is the irresistible Hook (4-6 seconds).
- Scene 1 is the Core Discovery / Revelation (6-10 seconds).
- Scene 2 is the Cosmic Twist / Climax (6-10 seconds).
- Every scene must have:
  - "index": number (0, 1, 2)
  - "narration": string (punchy, evocative spoken text)
  - "visualDescription": string (footage visual guidance)
  - "suggestedKeywords": array of strings (search queries for b-roll)
- Output format JSON:
  {
    "title": string,
    "totalEstimatedSeconds": number,
    "scenes": [ ... ]
  }`;

    const script = await this.gemini.generateJson<ScriptOutput>(prompt, () => {
      this.logger.warn('Using deterministic script generator fallback.');
      return {
        title: brief.topic,
        totalEstimatedSeconds: 18,
        scenes: [
          {
            index: 0,
            narration: brief.hook,
            visualDescription: 'Deep space stars colliding with an immense energy shockwave.',
            suggestedKeywords: ['deep space', 'galaxy nebula', 'stars universe'],
            approxDurationSeconds: 6,
          },
          {
            index: 1,
            narration: brief.keyFacts[0] || 'A single blast unleashes the power of countless suns in a fraction of a heartbeat.',
            visualDescription: 'Extreme close up of a spinning magnetar with crackling magnetic field lines.',
            suggestedKeywords: ['pulsar star', 'neutron star', 'astronomy galaxy'],
            approxDurationSeconds: 6,
          },
          {
            index: 2,
            narration: brief.keyFacts[1] || 'They vanish as quickly as they appear, leaving scientists racing to decode their secrets.',
            visualDescription: 'Giant radio telescope dishes under starlight listening to the cosmos.',
            suggestedKeywords: ['radio telescope', 'observatory night', 'satellite dish night'],
            approxDurationSeconds: 6,
          }
        ]
      };
    });

    this.logger.info(`Generated script containing ${script.scenes.length} scenes.`);
    return script;
  }
}
