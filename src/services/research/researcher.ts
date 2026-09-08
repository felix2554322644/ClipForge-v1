import { ResearchArtifact } from '../../contracts/artifacts';
import { GeminiClient } from '../gemini/client';
import { PipelineLogger } from '../logging/logger';

export class ResearchEngine {
  constructor(private gemini: GeminiClient, private logger: PipelineLogger) {}

  public async conductResearch(topic: string, allowFallback = true): Promise<ResearchArtifact> {
    this.logger.stageStart('research', `Topic: "${topic}"`);

    const prompt = `Conduct factual, deep, visual-oriented research for a short-form video on the topic: "${topic}".
Identify the most fascinating, counter-intuitive, and cinematic aspects of this topic.

Provide:
1. "keyFacts": Array of 4-6 concise, highly interesting factual bullets.
2. "importantEntities": Array of 3-5 key names, astronomical objects, physical forces, or core entities involved.
3. "chronology": Array of 3-5 chronological steps or sequential milestones explaining the phenomenon or history (step number, title, description).
4. "claims": Array of 2-4 core scientific/historical claims with context.
5. "visualOpportunities": Array of 4-6 vivid visual scene concepts that can be depicted with cinematic B-roll (sceneConcept, visualSubject, searchKeywords array).
6. "researchNotes": 1-2 paragraphs of synthesized narrative context and hook inspiration.`;

    const systemInstruction = `You are a scientific research director and documentary researcher. Extract high-impact, accurate, visually compelling research facts. Output strict JSON.`;

    if (this.gemini.isAvailable()) {
      try {
        const raw = await this.gemini.generateStructuredContent<any>(
          prompt,
          systemInstruction,
          '{ topic, keyFacts, importantEntities, chronology, claims, visualOpportunities, researchNotes }'
        );

        const validated = this.validateResearch(topic, raw);
        this.logger.stageCompleted('research', `Found ${validated.keyFacts.length} key facts, ${validated.visualOpportunities.length} visual cues`);
        return validated;
      } catch (err: any) {
        this.logger.stageError('research', err);
        if (!allowFallback) {
          throw err;
        }
        this.logger.warn('research', 'Using structured research fallback due to Gemini error.');
      }
    } else {
      if (!allowFallback) {
        throw new Error('Gemini API key is required for research stage, and fallback is disabled.');
      }
      this.logger.info('research', 'Gemini API not configured; using structured research synthesizer.');
    }

    const fallbackArtifact = this.generateFallbackResearch(topic);
    this.logger.stageCompleted('research', `Synthesized ${fallbackArtifact.keyFacts.length} research points (fallback mode)`);
    return fallbackArtifact;
  }

  private validateResearch(topic: string, data: any): ResearchArtifact {
    if (!data || typeof data !== 'object') {
      throw new Error('Research data must be an object.');
    }

    const keyFacts = Array.isArray(data.keyFacts) && data.keyFacts.length > 0
      ? data.keyFacts.map(String)
      : [`${topic} exhibits remarkable physical phenomena.`];

    const importantEntities = Array.isArray(data.importantEntities) && data.importantEntities.length > 0
      ? data.importantEntities.map(String)
      : [topic, 'Universe', 'Energy'];

    const chronology = Array.isArray(data.chronology) && data.chronology.length > 0
      ? data.chronology.map((c: any, idx: number) => ({
          step: typeof c.step === 'number' ? c.step : idx + 1,
          title: String(c.title || `Phase ${idx + 1}`),
          description: String(c.description || c.title || 'Phase description'),
        }))
      : [
          { step: 1, title: 'Inception', description: `Initial formation or trigger regarding ${topic}.` },
          { step: 2, title: 'Escalation', description: 'Intense energy release or critical state.' },
          { step: 3, title: 'Aftermath', description: 'Long-term cosmic or scientific implications.' },
        ];

    const claims = Array.isArray(data.claims) && data.claims.length > 0
      ? data.claims.map((c: any) => ({
          claim: String(c.claim || 'Primary finding'),
          context: String(c.context || 'Validated by observational research'),
        }))
      : [{ claim: `${topic} reshapes our understanding.`, context: 'Widely observed in modern science.' }];

    const visualOpportunities = Array.isArray(data.visualOpportunities) && data.visualOpportunities.length > 0
      ? data.visualOpportunities.map((v: any, idx: number) => ({
          sceneConcept: String(v.sceneConcept || `Cinematic perspective ${idx + 1}`),
          visualSubject: String(v.visualSubject || topic),
          searchKeywords: Array.isArray(v.searchKeywords) && v.searchKeywords.length > 0
            ? v.searchKeywords.map(String)
            : [topic, 'cinematic', 'space'],
        }))
      : [
          { sceneConcept: 'Opening impact', visualSubject: topic, searchKeywords: [topic, 'space', 'galaxy'] },
          { sceneConcept: 'Core phenomenon', visualSubject: 'Energy reaction', searchKeywords: ['star', 'explosion', 'light'] },
          { sceneConcept: 'Cosmic scale', visualSubject: 'Deep space vista', searchKeywords: ['nebula', 'cosmos', 'particles'] },
        ];

    const researchNotes = typeof data.researchNotes === 'string' && data.researchNotes.length > 0
      ? data.researchNotes
      : `Synthesized research foundation for ${topic}.`;

    return {
      topic,
      keyFacts,
      importantEntities,
      chronology,
      claims,
      visualOpportunities,
      researchNotes,
      metadata: {
        model: this.gemini.isAvailable() ? 'gemini-3.8-flash' : 'fallback-synthesizer',
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private generateFallbackResearch(topic: string): ResearchArtifact {
    return {
      topic,
      keyFacts: [
        `${topic} represents one of the most astonishing occurrences in nature.`,
        'Immense gravitational, physical, and elemental forces interact in extreme conditions.',
        'Modern observations have revealed surprising mechanics that challenge classical theories.',
        'The consequences cascade across astronomical scales and shape cosmic evolution.',
      ],
      importantEntities: [topic, 'Gravitational Fields', 'Elemental Particles', 'Cosmic Energy'],
      chronology: [
        { step: 1, title: 'Initial Convergence', description: `Precursor conditions align around ${topic}.` },
        { step: 2, title: 'Extreme Threshold', description: 'Critical mass and energetic transformation take place.' },
        { step: 3, title: 'Cosmic Dispersion', description: 'The permanent imprint left on surrounding space and matter.' },
      ],
      claims: [
        { claim: `${topic} concentrates immense physical power into a single event.`, context: 'Documented by astrophysical spectroscopy.' },
        { claim: 'Materials formed during this process disperse across the cosmos.', context: 'Supported by heavy element distribution models.' },
      ],
      visualOpportunities: [
        { sceneConcept: 'Cosmic abyss and stellar expanse', visualSubject: 'Vast starry void', searchKeywords: ['galaxy', 'deep space', 'stars'] },
        { sceneConcept: 'Gravitational accretion and energy vortex', visualSubject: 'Swirling luminous plasma', searchKeywords: ['vortex', 'plasma', 'solar flare'] },
        { sceneConcept: 'Cataclysmic shockwave', visualSubject: 'Expanding cosmic explosion', searchKeywords: ['supernova', 'shockwave', 'nebula'] },
        { sceneConcept: 'Elemental remnants', visualSubject: 'Glowing atomic dust', searchKeywords: ['particles', 'gold dust', 'cosmos'] },
      ],
      researchNotes: `Deterministic structured research foundation for "${topic}", highlighting core physical drivers and visual motifs.`,
      metadata: {
        model: 'deterministic-offline-synthesizer',
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
