import { CONFIG } from '../../config/index';

export interface PixabayVideoStream {
  url: string;
  width: number;
  height: number;
  size: number;
  thumbnail?: string;
}

export interface PixabayVideoHit {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  duration: number;
  videos: {
    large?: PixabayVideoStream;
    medium?: PixabayVideoStream;
    small?: PixabayVideoStream;
    tiny?: PixabayVideoStream;
  };
  views?: number;
  downloads?: number;
  likes?: number;
  user?: string;
}

export interface PixabaySearchResponse {
  total: number;
  totalHits: number;
  hits: PixabayVideoHit[];
}

export class PixabayClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || CONFIG.PIXABAY_API_KEY;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Searches Pixabay Video API for footage matching the query.
   * Safe with rate-limit handling and never exposes the API key in logs.
   */
  async searchVideos(query: string, perPage = 10): Promise<PixabayVideoHit[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const sanitizedQuery = encodeURIComponent(query.trim());
    const url = `https://pixabay.com/api/videos/?key=${this.apiKey}&q=${sanitizedQuery}&video_type=film&per_page=${perPage}&safesearch=true`;

    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const res = await fetch(url);

        if (res.status === 429) {
          // Rate limited: wait briefly if retry is possible
          if (attempts < maxAttempts) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          return [];
        }

        if (!res.ok) {
          if (!CONFIG.ALLOW_FALLBACKS) {
            throw new Error(`Pixabay API HTTP error ${res.status}: ${res.statusText}`);
          }
          return [];
        }

        const data = (await res.json()) as PixabaySearchResponse;
        return data.hits || [];
      } catch (err: any) {
        if (attempts >= maxAttempts) {
          if (!CONFIG.ALLOW_FALLBACKS) {
            throw new Error(`Pixabay API request failed: ${err.message}`);
          }
          return [];
        }
      }
    }

    return [];
  }
}
