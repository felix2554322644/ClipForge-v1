import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const ROOT_DIR = process.cwd();

export const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  PEXELS_API_KEY: process.env.PEXELS_API_KEY || '',
  VIDEO_TOPIC: process.env.VIDEO_TOPIC || 'The Mystery of Deep Space Fast Radio Bursts',
  OUTPUT_DIR: path.resolve(ROOT_DIR, process.env.OUTPUT_DIR || 'artifacts'),
  CACHE_DIR: path.resolve(ROOT_DIR, 'cache'),
  PIPER_PATH: path.resolve(ROOT_DIR, 'bin/piper/piper'),
  PIPER_MODEL_PATH: path.resolve(
    ROOT_DIR,
    process.env.PIPER_MODEL_PATH || 'models/en_US-lessac-medium.onnx'
  ),
  ALLOW_FALLBACKS: process.env.ALLOW_FALLBACKS === 'true',
  TARGET_WIDTH: 1080,
  TARGET_HEIGHT: 1920,
  TARGET_FPS: 30,
};
