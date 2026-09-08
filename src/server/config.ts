import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export interface PipelineConfig {
  geminiApiKey: string | undefined;
  pexelsApiKey: string | undefined;
  piperPath: string | undefined;
  piperModel: string | undefined;
  ffmpegPath: string;
  ffprobePath: string;
  outputDir: string;
  cacheDir: string;
  jobsDir: string;
  defaultResolution: {
    width: number;
    height: number;
  };
  defaultFps: number;
}

const rootDir = process.cwd();

export const config: PipelineConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  pexelsApiKey: process.env.PEXELS_API_KEY,
  piperPath: process.env.PIPER_PATH,
  piperModel: process.env.PIPER_MODEL,
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
  outputDir: process.env.OUTPUT_DIR ? path.resolve(rootDir, process.env.OUTPUT_DIR) : path.resolve(rootDir, 'output'),
  cacheDir: process.env.CACHE_DIR ? path.resolve(rootDir, process.env.CACHE_DIR) : path.resolve(rootDir, 'cache'),
  jobsDir: path.resolve(rootDir, 'jobs'),
  defaultResolution: {
    width: 1080,
    height: 1920,
  },
  defaultFps: 30,
};

export function parseResolutionProfile(profile?: string): { width: number; height: number } {
  if (profile === '540x960') return { width: 540, height: 960 };
  if (profile === '720x1280') return { width: 720, height: 1280 };
  return { width: 1080, height: 1920 };
}
