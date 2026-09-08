import { GoogleGenAI } from '@google/genai';
import { AppConfig } from '../../config';

export class GeminiClient {
  private ai: GoogleGenAI | null = null;
  private readonly modelName = 'gemini-3.8-flash';
  private maxRetries = 3;
  private baseRetryDelayMs = 1500;

  constructor(private config: AppConfig) {
    if (config.geminiApiKey) {
      this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }
  }

  public isAvailable(): boolean {
    return this.ai !== null;
  }

  public async generateStructuredContent<T>(
    prompt: string,
    systemInstruction?: string,
    schemaDescription?: string
  ): Promise<T> {
    if (!this.ai) {
      throw new Error('Gemini API key is not configured. Unable to make Gemini call.');
    }

    let lastError: any = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const fullPrompt = `${prompt}\n\nIMPORTANT: Respond ONLY with valid, raw JSON matching this schema: ${schemaDescription || 'the requested JSON structure'}. Do not include markdown codeblocks or conversational text.`;

        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: fullPrompt,
          config: {
            systemInstruction: systemInstruction || 'You are an expert video producer and researcher. Always output valid JSON.',
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        });

        const text = response.text?.trim() || '';
        if (!text) {
          throw new Error('Gemini returned an empty response.');
        }

        // Clean any accidental markdown backticks
        const cleaned = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(cleaned) as T;
        return parsed;
      } catch (err: any) {
        lastError = err;
        const isTransient =
          err?.status === 503 ||
          err?.status === 429 ||
          err?.code === 503 ||
          err?.code === 429 ||
          err?.message?.includes('high demand') ||
          err?.message?.includes('ECONNRESET') ||
          err?.message?.includes('ETIMEDOUT');

        if (attempt < this.maxRetries && isTransient) {
          const delay = this.baseRetryDelayMs * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        throw new Error(`Gemini generation failed: ${err.message || err}`);
      }
    }

    throw lastError;
  }
}
