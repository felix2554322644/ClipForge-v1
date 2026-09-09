import { GoogleGenAI } from '@google/genai';
import { CONFIG } from '../../config/index';

export class GeminiClient {
  private ai?: GoogleGenAI;

  constructor() {
    if (CONFIG.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });
    }
  }

  isAvailable(): boolean {
    return Boolean(this.ai);
  }

  async generateJson<T>(prompt: string, fallbackGenerator?: () => T): Promise<T> {
    if (this.ai) {
      try {
        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt + '\n\nIMPORTANT: Respond ONLY with valid, raw JSON. No markdown blocks, no commentary.',
        });

        const text = response.text || '';
        const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
        return JSON.parse(cleaned) as T;
      } catch (err) {
        if (!CONFIG.ALLOW_FALLBACKS) {
          throw new Error(`Gemini API call failed: ${(err as Error).message}`);
        }
      }
    }

    if (fallbackGenerator) {
      return fallbackGenerator();
    }

    throw new Error('Gemini API is unavailable and no fallback generator was supplied.');
  }
}
