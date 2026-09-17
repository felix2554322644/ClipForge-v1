export interface StockVideoAsset {
  id: string;
  provider: 'pexels' | 'pixabay';
  url: string;
  downloadUrl: string;
  width: number;
  height: number;
  duration: number;
  aspectRatio: number;
  nativeVertical: boolean;
  tags: string[];
}

export async function searchPexelsVideos(
  query: string,
  apiKey: string,
  orientation = 'portrait'
): Promise<StockVideoAsset[]> {
  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=10`;
    const resp = await fetch(url, {
      headers: { Authorization: apiKey },
    });
    if (!resp.ok) return [];

    const data = (await resp.json()) as any;
    const assets: StockVideoAsset[] = [];

    for (const v of data.videos || []) {
      const bestFile = (v.video_files || [])
        .filter((f: any) => f.link && f.width && f.height)
        .sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];

      if (!bestFile) continue;

      const isVertical = (bestFile.height || 0) > (bestFile.width || 0);
      assets.push({
        id: `pexels_${v.id}`,
        provider: 'pexels',
        url: v.url || '',
        downloadUrl: bestFile.link,
        width: bestFile.width,
        height: bestFile.height,
        duration: v.duration || 5,
        aspectRatio: bestFile.width / bestFile.height,
        nativeVertical: isVertical,
        tags: (v.tags || []).map((t: any) => (typeof t === 'string' ? t : t.name || '')),
      });
    }

    return assets;
  } catch {
    return [];
  }
}

export async function searchPixabayVideos(
  query: string,
  apiKey: string
): Promise<StockVideoAsset[]> {
  try {
    const url = `https://pixabay.com/api/videos/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&per_page=10`;
    const resp = await fetch(url);
    if (!resp.ok) return [];

    const data = (await resp.json()) as any;
    const assets: StockVideoAsset[] = [];

    for (const hit of data.hits || []) {
      const v = hit.videos?.large || hit.videos?.medium || hit.videos?.small;
      if (!v || !v.url) continue;

      const isVertical = (v.height || 0) > (v.width || 0);
      assets.push({
        id: `pixabay_${hit.id}`,
        provider: 'pixabay',
        url: hit.pageURL || '',
        downloadUrl: v.url,
        width: v.width || 1080,
        height: v.height || 1920,
        duration: hit.duration || 5,
        aspectRatio: (v.width || 1080) / (v.height || 1920),
        nativeVertical: isVertical,
        tags: (hit.tags || '').split(',').map((t: string) => t.trim()),
      });
    }

    return assets;
  } catch {
    return [];
  }
}
