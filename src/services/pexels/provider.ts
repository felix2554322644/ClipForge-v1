import { BrollProvider, NormalizedBrollVideo } from '../broll/provider';
import { PexelsClient } from './client';
import { CONFIG } from '../../config/index';

export class PexelsProvider implements BrollProvider {
  readonly name = 'pexels' as const;
  private client: PexelsClient;

  constructor(client?: PexelsClient) {
    this.client = client || new PexelsClient();
  }

  isAvailable(): boolean {
    return this.client.isAvailable();
  }

  async searchVideos(
    query: string,
    orientation: 'portrait' | 'landscape' = 'portrait'
  ): Promise<NormalizedBrollVideo[]> {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const rawVideos = await this.client.searchVideos(query, orientation);
      const normalized: NormalizedBrollVideo[] = [];

      for (const video of rawVideos) {
        if (!video.video_files || video.video_files.length === 0) continue;

        // Choose the best file prioritizing vertical resolution >= 1080p, then 720p
        const sortedFiles = [...video.video_files].sort((a, b) => {
          const aPixels = a.width * a.height;
          const bPixels = b.width * b.height;
          return bPixels - aPixels;
        });

        // Find file matching portrait orientation
        const portraitFile =
          sortedFiles.find((f) => f.width < f.height) || sortedFiles[0];

        const width = portraitFile.width || video.width;
        const height = portraitFile.height || video.height;
        const aspectRatio = width / height;
        const isLandscape = width > height;

        // HARD LANDSCAPE FILTER: Reject landscape by default
        if (isLandscape && !CONFIG.ALLOW_LANDSCAPE_FALLBACK) {
          continue;
        }

        const nativeVertical = aspectRatio <= 0.85;

        normalized.push({
          id: `pexels_${video.id}`,
          provider: 'pexels',
          providerAssetId: String(video.id),
          sourceUrl: video.url,
          downloadUrl: portraitFile.link,
          width,
          height,
          aspectRatio,
          durationSeconds: video.duration,
          fps: portraitFile.fps,
          quality: portraitFile.quality,
          nativeVertical,
          thumbnailUrl: video.image,
          previewUrl: portraitFile.link || video.image,
        });
      }

      return normalized;
    } catch (err) {
      if (!CONFIG.ALLOW_FALLBACKS) {
        throw err;
      }
      return [];
    }
  }
}
