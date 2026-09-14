import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const ROOT_DIR = process.cwd();

export const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2 || '',
  GEMINI_API_KEY_3: process.env.GEMINI_API_KEY_3 || '',
  GEMINI_PROJECT_ID: process.env.GEMINI_PROJECT_ID || '',
  GEMINI_PROJECT_ID_2: process.env.GEMINI_PROJECT_ID_2 || '',
  GEMINI_PROJECT_ID_3: process.env.GEMINI_PROJECT_ID_3 || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  
  // Centralized Gemini Usage Governor & Candidate Limits
  CLIPFORGE_MAX_GEMINI_REQUESTS: parseInt(process.env.CLIPFORGE_MAX_GEMINI_REQUESTS || '12', 10),
  CLIPFORGE_MAX_SEARCH_ROUNDS: parseInt(process.env.CLIPFORGE_MAX_SEARCH_ROUNDS || '2', 10),
  CLIPFORGE_MAX_CANDIDATES_TOTAL: parseInt(process.env.CLIPFORGE_MAX_CANDIDATES_TOTAL || '20', 10),
  CLIPFORGE_MAX_CANDIDATES_PER_SEARCH: parseInt(process.env.CLIPFORGE_MAX_CANDIDATES_PER_SEARCH || '10', 10),
  CLIPFORGE_MAX_CANDIDATE_EVALUATIONS: parseInt(process.env.CLIPFORGE_MAX_CANDIDATE_EVALUATIONS || '12', 10),
  CLIPFORGE_MAX_DIRECTOR_CALLS: parseInt(process.env.CLIPFORGE_MAX_DIRECTOR_CALLS || '2', 10),
  CLIPFORGE_MAX_QC_CALLS: parseInt(process.env.CLIPFORGE_MAX_QC_CALLS || '1', 10),

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
  hasTertiary: boolean;
  activeKeyCount: number;
  model: string;
  warnings: string[];
  slots: { slot: number; name: string; configured: boolean; projectId?: string }[];
} {
  const warnings: string[] = [];
  const hasPrimary = Boolean(CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY.trim() !== '');
  const hasSecondary = Boolean(CONFIG.GEMINI_API_KEY_2 && CONFIG.GEMINI_API_KEY_2.trim() !== '');
  const hasTertiary = Boolean(CONFIG.GEMINI_API_KEY_3 && CONFIG.GEMINI_API_KEY_3.trim() !== '');

  const slots = [
    { slot: 1, name: 'Gemini account slot 1', configured: hasPrimary, projectId: CONFIG.GEMINI_PROJECT_ID || undefined },
    { slot: 2, name: 'Gemini account slot 2', configured: hasSecondary, projectId: CONFIG.GEMINI_PROJECT_ID_2 || undefined },
    { slot: 3, name: 'Gemini account slot 3', configured: hasTertiary, projectId: CONFIG.GEMINI_PROJECT_ID_3 || undefined },
  ];

  const activeKeyCount = [hasPrimary, hasSecondary, hasTertiary].filter(Boolean).length;

  if (!hasPrimary) {
    warnings.push('GEMINI_API_KEY (primary) is not configured.');
  }

  if (!hasSecondary) {
    warnings.push('GEMINI_API_KEY_2 (secondary fallback) is not configured.');
  }

  if (!hasTertiary) {
    warnings.push('GEMINI_API_KEY_3 (tertiary fallback) is not configured.');
  }

  // Project quota honesty check
  if (hasPrimary && hasSecondary && !CONFIG.GEMINI_PROJECT_ID_2 && !CONFIG.GEMINI_PROJECT_ID) {
    warnings.push('Note: Slots 1 and 2 share the same Google Cloud Project if not explicitly distinct. Gemini quotas are project-level.');
  }

  return {
    hasPrimary,
    hasSecondary,
    hasTertiary,
    activeKeyCount,
    model: CONFIG.GEMINI_MODEL,
    warnings,
    slots,
  };
}
