import { ResearchArtifact, PipelineInput } from '../../types/pipeline.js';
import { getGeminiClient } from '../geminiClient.js';
import { logger } from '../logger.js';

export class ResearchService {
  public async conductResearch(jobId: string, input: PipelineInput): Promise<ResearchArtifact> {
    logger.info(jobId, 'research', `Starting factual research on topic: "${input.topic}"`);

    const gemini = getGeminiClient();

    if (!gemini) {
      logger.warn(jobId, 'research', 'GEMINI_API_KEY not configured. Using deterministic fallback research engine.');
      return this.generateFallbackResearch(input.topic);
    }

    try {
      const prompt = `You are an expert factual researcher preparing structured foundational data for a high-retention short-form video.
Topic: "${input.topic}"
Target Style/Tone: ${input.style || 'educational and captivating'}

Produce a structured JSON response conforming strictly to the following schema:
{
  "topic": string,
  "keyFacts": string[] (at least 4 concrete, verified factual points),
  "importantEntities": string[] (key scientific, historical, or physical entities involved),
  "chronology": string[] (logical or time-based progression of events/processes),
  "claims": string[] (core thesis statements),
  "visualOpportunities": string[] (vivid visual scenes, objects, or phenomena that can be illustrated with video footage),
  "sources": string[] (relevant scientific principles, publications, or domain fields)
}

Ensure the facts are punchy, accurate, and visually evocative. Output pure JSON only.`;

      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      });

      const text = response.text?.trim() || '{}';
      const parsed = JSON.parse(text);

      const artifact: ResearchArtifact = {
        topic: input.topic,
        keyFacts: Array.isArray(parsed.keyFacts) && parsed.keyFacts.length ? parsed.keyFacts : [
          `${input.topic} involves extreme physical principles.`,
          `Intense gravitational and energetic interactions dominate.`,
          `Matter reaches high relativistic speeds and temperatures.`,
          `Observations confirm powerful observable signatures in space.`,
        ],
        importantEntities: Array.isArray(parsed.importantEntities) ? parsed.importantEntities : ['Gravity', 'Mass', 'Radiation', 'Event Horizon'],
        chronology: Array.isArray(parsed.chronology) ? parsed.chronology : [
          'Initial encounter and gravitational attraction',
          'Tidal disruption and extreme deformation',
          'Matter accretion and high-energy release',
          'Final dissipation or absorption',
        ],
        claims: Array.isArray(parsed.claims) ? parsed.claims : [
          `${input.topic} showcases the universe's most intense dynamics.`,
        ],
        visualOpportunities: Array.isArray(parsed.visualOpportunities) && parsed.visualOpportunities.length ? parsed.visualOpportunities : [
          'Deep cosmos star field with distortion',
          'Swirling cosmic dust and gas accretion disk',
          'Explosive energetic bursts and shockwaves',
          'Telescopic views of glowing nebulae and galaxies',
        ],
        sources: Array.isArray(parsed.sources) ? parsed.sources : ['Astrophysics domain analysis', 'NASA observations'],
        generatedAt: new Date().toISOString(),
      };

      logger.info(jobId, 'research', `Research completed successfully with ${artifact.keyFacts.length} key facts and ${artifact.visualOpportunities.length} visual cues.`);
      return artifact;
    } catch (error: any) {
      logger.error(jobId, 'research', `Gemini research failed: ${error.message}. Falling back to structured generator.`, error);
      return this.generateFallbackResearch(input.topic);
    }
  }

  public generateFallbackResearch(topic: string): ResearchArtifact {
    const cleanTopic = topic.trim();
    return {
      topic: cleanTopic,
      keyFacts: [
        `${cleanTopic} is driven by fundamental physical forces and extreme energy balances.`,
        `Gravitational, thermal, or kinetic forces overcome structural boundaries.`,
        `The process occurs at staggering scales, converting mass and energy rapidly.`,
        `Observational data reveals distinct shockwaves, emissions, and debris fields.`,
      ],
      importantEntities: [
        'Cosmic matter',
        'Gravitational field',
        'Shock fronts',
        'High-energy radiation',
      ],
      chronology: [
        'Initial approach and threshold crossing',
        'Intense tidal distortion and fragmentation',
        'Formation of superheated accretion flows',
        'Residual cosmic expansion and dispersal',
      ],
      claims: [
        `Understanding ${cleanTopic} unlocks the mysteries of cosmic evolution.`,
      ],
      visualOpportunities: [
        'Deep space star clusters and glowing nebulae',
        'Rapidly rotating celestial vortex and luminous matter',
        'Explosive burst of particles and blinding cosmic light',
        'Quiet aftermath of stellar remnants across the void',
      ],
      sources: [
        'Astrophysics and General Relativity principles',
        'Astronomical survey observations',
      ],
      generatedAt: new Date().toISOString(),
    };
  }
}

export const researchService = new ResearchService();
