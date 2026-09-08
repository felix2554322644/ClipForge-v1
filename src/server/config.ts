import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

export interface PipelineConfig {
  geminiApiKey: string | undefined;
  pexelsApiKey: string | undefined;
  piperPath: string;
  piperModel: string;
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

function resolvePiperPath(): string {
  const envVal = process.env.PIPER_PATH || process.env.PIPER_BIN;
  if (envVal) {
    if (fs.existsSync(envVal)) return path.resolve(envVal);
    return envVal;
  }
  const localProjectBin = path.resolve(rootDir, 'bin', 'piper', 'piper');
  if (fs.existsSync(localProjectBin)) return localProjectBin;
  return 'piper';
}

function resolvePiperModel(): string {
  const envVal = process.env.PIPER_MODEL;
  if (envVal) {
    if (fs.existsSync(envVal)) return path.resolve(envVal);
    return envVal;
  }
  const localModel = path.resolve(rootDir, 'models', 'en_US-lessac-medium.onnx');
  if (fs.existsSync(localModel)) return localModel;
  return 'en_US-lessac-medium.onnx';
}

export const config: PipelineConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  pexelsApiKey: process.env.PEXELS_API_KEY,
  piperPath: resolvePiperPath(),
  piperModel: resolvePiperModel(),
  ffmpegPath: process.env.FFMPEG_PATH || process.env.FFMPEG_BIN || 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || process.env.FFPROBE_BIN || 'ffprobe',
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
