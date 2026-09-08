export interface BrollCandidate {
  id: string | number;
  provider: 'pexels' | 'procedural' | 'mock';
  title?: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  downloadUrl: string;
  thumbnailUrl?: string;
  orientation: 'portrait' | 'landscape' | 'square';
  quality: string;
  queryMatched?: string;
}

export interface BrollSearchOptions {
  perPage?: number;
  orientation?: 'portrait' | 'landscape';
  minDurationSec?: number;
}

export interface IBrollProvider {
  readonly name: string;
  isAvailable(): boolean;
  searchVideos(query: string, options?: BrollSearchOptions): Promise<BrollCandidate[]>;
  downloadVideo(candidate: BrollCandidate, destinationDir: string): Promise<string>;
}
