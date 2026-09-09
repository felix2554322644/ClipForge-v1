import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const ROOT_DIR = process.cwd();

export const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2 || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  PEXELS_API_KEY: process.env.PEXELS_API_KEY || '',
  PIXABAY_API_KEY: process.env.PIXABAY_API_KEY || '',
  VIDEO_TOPIC: process.env.VIDEO_TOPIC || 'automatic',
  OUTPUT_DIR: path.resolve(ROOT_DIR, process.env.OUTPUT_DIR || 'artifacts'),
  CACHE_DIR: path.resolve(ROOT_DIR, 'cache'),
  TOPICS_DIR: path.resolve(ROOT_DIR, 'topics'),
  TOPICS_FILE: path.resolve(ROOT_DIR, 'topics/topics.json'),
  TOPIC_STATE_FILE: path.resolve(ROOT_DIR, 'topics/topic-state.json'),
  PIPER_PATH: path.resolve(ROOT_DIR, 'bin/piper/piper'),
  PIPER_MODEL_PATH: path.resolve(
    ROOT_DIR,
    process.env.PIPER_MODEL_PATH || 'models/en_US-lessac-medium.onnx'
  ),
  ALLOW_FALLBACKS: process.env.ALLOW_FALLBACKS === 'true',
  ALLOW_LANDSCAPE_FALLBACK: process.env.ALLOW_LANDSCAPE_FALLBACK === 'true', // Default FALSE (hard landscape filter)
  TARGET_WIDTH: 1080,
  TARGET_HEIGHT: 1920,
  TARGET_FPS: 30,
};

export function validateGeminiConfiguration(): {
  hasPrimary: boolean;
  hasSecondary: boolean;
  model: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const hasPrimary = Boolean(CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY.trim() !== '');
  const hasSecondary = Boolean(CONFIG.GEMINI_API_KEY_2 && CONFIG.GEMINI_API_KEY_2.trim() !== '');

  if (!hasPrimary) {
    warnings.push('GEMINI_API_KEY (primary) is not configured.');
  }

  if (!hasSecondary) {
    warnings.push('GEMINI_API_KEY_2 (secondary fallback) is not configured. Failover will be unavailable.');
  }

  return {
    hasPrimary,
    hasSecondary,
    model: CONFIG.GEMINI_MODEL,
    warnings,
  };
}
