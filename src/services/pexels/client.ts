import { CONFIG } from '../../config/index';

export interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  fps: number;
  link: string;
}

export interface PexelsVideoItem {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  video_files: PexelsVideoFile[];
}

export interface PexelsSearchResponse {
  page: number;
  per_page: number;
  total_results: number;
  videos: PexelsVideoItem[];
}

export class PexelsClient {
  private apiKey: string;

  constructor() {
    this.apiKey = CONFIG.PEXELS_API_KEY;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async searchVideos(
    query: string,
    orientation: 'portrait' | 'landscape' = 'portrait',
    perPage = 15
  ): Promise<PexelsVideoItem[]> {
    if (!this.apiKey) {
      if (!CONFIG.ALLOW_FALLBACKS) {
        throw new Error('Pexels API key is not configured and fallbacks are disabled.');
      }
      return [];
    }

    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${perPage}`;
    const res = await fetch(url, {
      headers: {
        Authorization: this.apiKey,
      },
    });

    if (!res.ok) {
      if (!CONFIG.ALLOW_FALLBACKS) {
        throw new Error(`Pexels API HTTP error ${res.status}: ${res.statusText}`);
      }
      return [];
    }

    const data = (await res.json()) as PexelsSearchResponse;
    return data.videos || [];
  }
}
