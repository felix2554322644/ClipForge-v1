import { BrollProviderName } from '../../types/pipeline';

export interface NormalizedBrollVideo {
  id: string;
  provider: BrollProviderName;
  providerAssetId: string;
  sourceUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
  durationSeconds: number;
  fps?: number;
  quality?: string;
  tags?: string[];
  nativeVertical: boolean;
  thumbnailUrl?: string;
  previewUrl?: string;
}

export interface BrollProvider {
  readonly name: BrollProviderName;
  isAvailable(): boolean;
  searchVideos(
    query: string,
    orientation?: 'portrait' | 'landscape'
  ): Promise<NormalizedBrollVideo[]>;
}
