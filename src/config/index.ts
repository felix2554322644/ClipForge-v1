import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

dotenv.config();

export interface VideoProfileConfig {
  name: string;
  width: number;
  height: number;
  fps: number;
  videoBitrate: string;
  audioBitrate: string;
}

export const VIDEO_PROFILES: Record<string, VideoProfileConfig> = {
  'vertical-1080': {
    name: 'vertical-1080',
    width: 1080,
    height: 1920,
    fps: 30,
    videoBitrate: '4500k',
    audioBitrate: '192k',
  },
  'vertical-720': {
    name: 'vertical-720',
    width: 720,
    height: 1280,
    fps: 30,
    videoBitrate: '2500k',
    audioBitrate: '128k',
  },
  'vertical-540': {
    name: 'vertical-540',
    width: 540,
    height: 960,
    fps: 30,
    videoBitrate: '1500k',
    audioBitrate: '128k',
  },
};

export interface AppConfig {
  geminiApiKey?: string;
  pexelsApiKey?: string;
  piperBin: string;
  piperModel: string;
  ffmpegBin: string;
  ffprobeBin: string;
  artifactsDir: string;
  cacheDir: string;
  allowFallbacks: boolean;
}

function resolveBin(envVal?: string, defaultCmd: string = 'piper'): string {
  if (envVal) {
    if (fs.existsSync(envVal)) return path.resolve(envVal);
    return envVal;
  }
  // Check local project bin
  const localProjectBin = path.resolve(process.cwd(), 'bin', defaultCmd, defaultCmd);
  if (fs.existsSync(localProjectBin)) return localProjectBin;

  const localProjectBinDirect = path.resolve(process.cwd(), 'bin', defaultCmd);
  if (fs.existsSync(localProjectBinDirect)) return localProjectBinDirect;

  return defaultCmd;
}

function resolveModel(envVal?: string): string {
  if (envVal && fs.existsSync(envVal)) return path.resolve(envVal);
  // Check local models dir
  const localModel = path.resolve(process.cwd(), 'models', 'en_US-lessac-medium.onnx');
  if (fs.existsSync(localModel)) return localModel;
  return envVal || 'en_US-lessac-medium.onnx';
}

export function loadConfig(): AppConfig {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY?.trim(),
    pexelsApiKey: process.env.PEXELS_API_KEY?.trim(),
    piperBin: resolveBin(process.env.PIPER_BIN, 'piper'),
    piperModel: resolveModel(process.env.PIPER_MODEL),
    ffmpegBin: process.env.FFMPEG_BIN || 'ffmpeg',
    ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe',
    artifactsDir: path.resolve(process.cwd(), process.env.ARTIFACTS_DIR || 'artifacts'),
    cacheDir: path.resolve(process.cwd(), process.env.CACHE_DIR || 'cache'),
    allowFallbacks: process.env.ALLOW_FALLBACKS !== 'false',
  };
}

export interface DependencyCheckResult {
  node: { ok: boolean; version: string };
  ffmpeg: { ok: boolean; path: string; version?: string };
  ffprobe: { ok: boolean; path: string; version?: string };
  piper: { ok: boolean; path: string; version?: string };
  piperModel: { ok: boolean; path: string };
  geminiKey: { ok: boolean };
  pexelsKey: { ok: boolean };
  allPassed: boolean;
  warnings: string[];
}

export function verifyDependencies(config: AppConfig, strictApiKeys = false): DependencyCheckResult {
  const result: DependencyCheckResult = {
    node: { ok: true, version: process.version },
    ffmpeg: { ok: false, path: config.ffmpegBin },
    ffprobe: { ok: false, path: config.ffprobeBin },
    piper: { ok: false, path: config.piperBin },
    piperModel: { ok: false, path: config.piperModel },
    geminiKey: { ok: Boolean(config.geminiApiKey) },
    pexelsKey: { ok: Boolean(config.pexelsApiKey) },
    allPassed: true,
    warnings: [],
  };

  // Check FFmpeg
  try {
    const out = execSync(`${config.ffmpegBin} -version`, { stdio: 'pipe' }).toString();
    result.ffmpeg.ok = true;
    result.ffmpeg.version = out.split('\n')[0];
  } catch (err) {
    result.allPassed = false;
    result.warnings.push(`FFmpeg executable not found at "${config.ffmpegBin}". FFmpeg is required for video rendering.`);
  }

  // Check FFprobe
  try {
    const out = execSync(`${config.ffprobeBin} -version`, { stdio: 'pipe' }).toString();
    result.ffprobe.ok = true;
    result.ffprobe.version = out.split('\n')[0];
  } catch (err) {
    result.allPassed = false;
    result.warnings.push(`FFprobe executable not found at "${config.ffprobeBin}". FFprobe is required for media validation.`);
  }

  // Check Piper
  try {
    const out = execSync(`${config.piperBin} --version`, { stdio: 'pipe' }).toString();
    result.piper.ok = true;
    result.piper.version = out.trim();
  } catch (err) {
    if (!config.allowFallbacks) {
      result.allPassed = false;
    }
    result.warnings.push(`Piper TTS executable not found at "${config.piperBin}". Run scripts/setup-piper.sh to install.`);
  }

  // Check Piper model
  if (fs.existsSync(config.piperModel)) {
    result.piperModel.ok = true;
  } else {
    if (!config.allowFallbacks) {
      result.allPassed = false;
    }
    result.warnings.push(`Piper ONNX model file not found at "${config.piperModel}".`);
  }

  // Check API keys
  if (!result.geminiKey.ok) {
    if (strictApiKeys || !config.allowFallbacks) {
      result.allPassed = false;
    }
    result.warnings.push('GEMINI_API_KEY environment variable is not set.');
  }

  if (!result.pexelsKey.ok) {
    if (strictApiKeys || !config.allowFallbacks) {
      result.allPassed = false;
    }
    result.warnings.push('PEXELS_API_KEY environment variable is not set.');
  }

  return result;
}
