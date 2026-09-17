/**
 * ClipForge v2 Brand Bible & Editorial Constants
 *
 * Defines the single authoritative design, aesthetic, and narrative system
 * across all visual, typographic, motion, audio, and prompt components.
 */

export interface BrandBibleConfig {
  brandName: string;
  niche: {
    name: string;
    description: string;
    targetDurationSeconds: {
      min: number;
      target: number;
      max: number;
    };
    storyStructure: Array<{
      beat: 'hook' | 'ground_it' | 'escalation' | 'peak_implication' | 'reframe_line';
      label: string;
      description: string;
      pacingProfile: 'rapid_arrest' | 'measured_gravity' | 'accelerating_compression' | 'held_breath' | 'lingering_reframe';
      defaultDurationSeconds: number;
    }>;
    bannedPhrases: string[];
    voiceStyle: string;
  };
  typography: {
    headlineFont: string;
    bodyFont: string;
    captionFont: string;
    headlineWeight: number;
    captionWeight: number;
  };
  colors: {
    canvasBackground: string; // Warm off-white / cream
    canvasDark: string;
    inkText: string;
    inkMuted: string;
    brandAccent: string; // Sunset Vermilion
    brandAccentHover: string;
    scrimOverlay: string;
    filmGrainOpacity: number;
  };
  motion: {
    defaultEasing: string;
    peakImplicationSpeedRamp: number;
    hookZoomMultiplier: number;
    forebodingPanAmount: number;
  };
  audio: {
    targetLufs: number;
    targetTruePeakDb: number;
    musicDuckingDb: number;
    ambienceDuckingDb: number;
  };
}

export const BRAND_BIBLE: BrandBibleConfig = {
  brandName: 'ClipForge',
  niche: {
    name: 'What If Thought Experiments',
    description: 'High-gravity, narrative-driven 60-90s thought experiments that escalate ordinary reality into counterintuitive peak implications.',
    targetDurationSeconds: {
      min: 50,
      target: 68,
      max: 90,
    },
    storyStructure: [
      {
        beat: 'hook',
        label: '1. Hook',
        description: 'Posit the premise as stated fact with zero preamble ("What if you could never forget anything").',
        pacingProfile: 'rapid_arrest',
        defaultDurationSeconds: 4.0,
      },
      {
        beat: 'ground_it',
        label: '2. Ground It',
        description: 'Establish the single ordinary rule of reality broken by this premise.',
        pacingProfile: 'measured_gravity',
        defaultDurationSeconds: 8.0,
      },
      {
        beat: 'escalation',
        label: '3. Escalation Chain',
        description: '2 to 4 cascading consequences ("and that means..."), each stranger and larger than the last.',
        pacingProfile: 'accelerating_compression',
        defaultDurationSeconds: 26.0,
      },
      {
        beat: 'peak_implication',
        label: '4. Peak Implication',
        description: 'The single most counterintuitive, paradigm-shifting consequence saved for last.',
        pacingProfile: 'held_breath',
        defaultDurationSeconds: 14.0,
      },
      {
        beat: 'reframe_line',
        label: '5. Reframe Line',
        description: 'A quiet closing line that makes the viewer sit with the reality, holding the frame.',
        pacingProfile: 'lingering_reframe',
        defaultDurationSeconds: 10.0,
      },
    ],
    bannedPhrases: [
      'have you ever wondered',
      "here's the crazy part",
      'mind-blowing',
      'mind blowing',
      'in this video',
      "let's dive in",
      'welcome to',
      'subscribe for more',
      'like and share',
      'today we explore',
      'believe it or not',
      'buckle up',
      'without further ado',
      'you wont believe',
      "you won't believe",
    ],
    voiceStyle: 'Second-person ("you") or close-first-person narrative with restrained, cinematic gravitas.',
  },
  typography: {
    headlineFont: 'Fraunces, "Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    bodyFont: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif',
    captionFont: '"Plus Jakarta Sans", sans-serif',
    headlineWeight: 800,
    captionWeight: 800,
  },
  colors: {
    canvasBackground: '#F9F6F0', // Warm off-white / editorial cream
    canvasDark: '#0E0F12',
    inkText: '#121316',
    inkMuted: '#5E616E',
    brandAccent: '#FF5722', // Vibrant sunset vermilion
    brandAccentHover: '#E64A19',
    scrimOverlay: 'rgba(14, 15, 18, 0.72)',
    filmGrainOpacity: 0.045,
  },
  motion: {
    defaultEasing: 'easeInOutCubic',
    peakImplicationSpeedRamp: 0.85,
    hookZoomMultiplier: 1.15,
    forebodingPanAmount: 0.08,
  },
  audio: {
    targetLufs: -16,
    targetTruePeakDb: -1.5,
    musicDuckingDb: -14,
    ambienceDuckingDb: -18,
  },
};
