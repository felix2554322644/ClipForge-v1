import { BrollProvider, NormalizedBrollVideo } from '../broll/provider';
import { PixabayClient, PixabayVideoStream } from './client';
import { CONFIG } from '../../config/index';

export class PixabayProvider implements BrollProvider {
  readonly name = 'pixabay' as const;
  private client: PixabayClient;

  constructor(client?: PixabayClient) {
    this.client = client || new PixabayClient();
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
      const hits = await this.client.searchVideos(query, 12);
      const normalized: NormalizedBrollVideo[] = [];

      for (const hit of hits) {
        if (!hit.videos) continue;

        // Extract available streams
        const streams: PixabayVideoStream[] = [
          hit.videos.large,
          hit.videos.medium,
          hit.videos.small,
          hit.videos.tiny,
        ].filter(Boolean) as PixabayVideoStream[];

        if (streams.length === 0) continue;

        // Find best stream prioritizing portrait with sufficient resolution
        const portraitStreams = streams.filter((s) => s.width <= s.height);

        let selectedStream: PixabayVideoStream;
        if (portraitStreams.length > 0) {
          // Sort by resolution descending
          portraitStreams.sort((a, b) => b.width * b.height - a.width * a.height);
          selectedStream = portraitStreams[0];
        } else {
          // All streams are landscape
          if (!CONFIG.ALLOW_LANDSCAPE_FALLBACK) {
            // HARD LANDSCAPE FILTER: Reject landscape by default
            continue;
          }
          streams.sort((a, b) => b.width * b.height - a.width * a.height);
          selectedStream = streams[0];
        }

        const width = selectedStream.width;
        const height = selectedStream.height;
        const aspectRatio = width / height;
        const isLandscape = width > height;

        if (isLandscape && !CONFIG.ALLOW_LANDSCAPE_FALLBACK) {
          continue;
        }

        const nativeVertical = aspectRatio <= 0.85;
        const tags = hit.tags ? hit.tags.split(',').map((t) => t.trim().toLowerCase()) : [];

        normalized.push({
          id: `pixabay_${hit.id}`,
          provider: 'pixabay',
          providerAssetId: String(hit.id),
          sourceUrl: hit.pageURL,
          downloadUrl: selectedStream.url,
          width,
          height,
          aspectRatio,
          durationSeconds: hit.duration,
          tags,
          nativeVertical,
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
