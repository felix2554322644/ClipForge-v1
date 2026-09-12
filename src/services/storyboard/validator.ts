import {
  Storyboard,
  StoryboardShot,
  StoryboardInput,
  PreferredVisualType,
  VisualPriority,
} from '../../types/storyboard';
import { VideoFormat } from '../../types/editorial';

export interface ValidationIssue {
  field: string;
  reason: string;
  actionTaken: string;
}

export class StoryboardValidator {
  private issues: ValidationIssue[] = [];

  getIssues(): ValidationIssue[] {
    return [...this.issues];
  }

  /**
   * Validates, sanitizes, and normalizes a raw storyboard from Gemini.
   * Returns a valid Storyboard or null if structurally unrecoverable.
   */
  validateAndSanitize(raw: any, input: StoryboardInput): Storyboard | null {
    this.issues = [];

    if (!raw || typeof raw !== 'object') {
      this.recordIssue('root', 'Root response is not an object', 'Rejecting');
      return null;
    }

    const rawShots = Array.isArray(raw.shots) ? raw.shots : null;
    if (!rawShots || rawShots.length === 0) {
      this.recordIssue('shots', 'Missing or empty shots array', 'Rejecting');
      return null;
    }

    const targetDuration = Math.max(1.0, input.narrationDurationSeconds);
    const format: VideoFormat = input.format === 'long' ? 'long' : 'short';
    const minShotDur = format === 'long' ? 1.2 : 0.75;
    const maxShotDur = format === 'long' ? 8.0 : 4.5;

    // 1. Sanitize individual shots
    const sanitizedShots: StoryboardShot[] = [];

    for (let i = 0; i < rawShots.length; i++) {
      const s = rawShots[i];
      if (!s || typeof s !== 'object') continue;

      const shotId =
        typeof s.shotId === 'string' && s.shotId.trim().length > 0
          ? s.shotId.trim()
          : `shot_${i}`;

      const sceneIndex = typeof s.sceneIndex === 'number' ? s.sceneIndex : Math.floor(i / 2);
      const shotIndex = typeof s.shotIndex === 'number' ? s.shotIndex : i;

      const narrationClause =
        typeof s.narrationClause === 'string' && s.narrationClause.trim().length > 0
          ? s.narrationClause.trim()
          : typeof s.narration === 'string' && s.narration.trim().length > 0
          ? s.narration.trim()
          : `Beat ${i + 1}`;

      const visualSubject =
        typeof s.visualSubject === 'string' && s.visualSubject.trim().length > 0
          ? s.visualSubject.trim()
          : typeof s.subject === 'string' && s.subject.trim().length > 0
          ? s.subject.trim()
          : 'Cosmic subject';

      const action =
        typeof s.action === 'string' && s.action.trim().length > 0
          ? s.action.trim()
          : typeof s.movement === 'string' && s.movement.trim().length > 0
          ? s.movement.trim()
          : 'Dynamic cosmic motion';

      const environment =
        typeof s.environment === 'string' && s.environment.trim().length > 0
          ? s.environment.trim()
          : typeof s.setting === 'string' && s.setting.trim().length > 0
          ? s.setting.trim()
          : 'Deep space cosmos';

      const emotion =
        typeof s.emotion === 'string' && s.emotion.trim().length > 0
          ? s.emotion.trim()
          : typeof s.mood === 'string' && s.mood.trim().length > 0
          ? s.mood.trim()
          : 'awe and curiosity';

      const framing =
        typeof s.framing === 'string' && s.framing.trim().length > 0
          ? s.framing.trim()
          : typeof s.composition === 'string' && s.composition.trim().length > 0
          ? s.composition.trim()
          : 'medium shot';

      const cameraMovement =
        typeof s.cameraMovement === 'string' && s.cameraMovement.trim().length > 0
          ? s.cameraMovement.trim()
          : typeof s.camera === 'string' && s.camera.trim().length > 0
          ? s.camera.trim()
          : typeof s.movementIntent === 'string' && s.movementIntent.trim().length > 0
          ? s.movementIntent.trim()
          : 'slow push in';

      const visualPurpose =
        typeof s.visualPurpose === 'string' && s.visualPurpose.trim().length > 0
          ? s.visualPurpose.trim()
          : i === 0
          ? 'hook_grab'
          : i === rawShots.length - 1
          ? 'closing_payoff'
          : 'story_escalation';

      const visualPriority = this.sanitizeVisualPriority(s.visualPriority);
      const preferredVisualType = this.sanitizePreferredVisualType(s.preferredVisualType);

      // Parse and clean search queries
      const searchQueries = this.sanitizeSearchQueries(
        s.searchQueries || s.searchQuery || s.queries,
        visualSubject,
        action,
        environment
      );

      // Extract raw timings
      let start = typeof s.narrationStart === 'number' ? s.narrationStart : 0;
      let end = typeof s.narrationEnd === 'number' ? s.narrationEnd : 0;

      if (end <= start) {
        end = start + 2.0;
      }

      sanitizedShots.push({
        shotId,
        sceneIndex,
        shotIndex,
        narrationStart: Math.max(0, start),
        narrationEnd: Math.max(0.1, end),
        durationSeconds: Math.max(0.1, end - start),
        narrationClause,
        visualSubject,
        action,
        environment,
        emotion,
        mood: emotion,
        framing,
        composition: framing,
        cameraMovement,
        visualPurpose,
        visualPriority,
        preferredVisualType,
        searchQueries,
        pacingType: s.pacingType || (i === 0 ? 'establishing' : 'normal'),
        suggestedMotionEffect: s.suggestedMotionEffect || (i % 2 === 0 ? 'zoom_in' : 'pan_left'),
        suggestedTransition: s.suggestedTransition || (i === 0 ? 'cut' : 'cut'),
      });
    }

    if (sanitizedShots.length === 0) {
      this.recordIssue('shots', 'No valid shots remained after sanitization', 'Rejecting');
      return null;
    }

    // 2. Strict Duration & Timestamp Normalization
    this.normalizeTimings(sanitizedShots, targetDuration, minShotDur, maxShotDur);

    const title =
      typeof raw.title === 'string' && raw.title.trim().length > 0
        ? raw.title.trim()
        : input.script.title || 'AI Storyboard';

    const visualThemes = Array.isArray(raw.visualThemes)
      ? raw.visualThemes.filter((t: any) => typeof t === 'string' && t.trim().length > 0)
      : [];

    return {
      title,
      totalDurationSeconds: targetDuration,
      format,
      pacingSummary: typeof raw.pacingSummary === 'string' ? raw.pacingSummary : undefined,
      visualThemes: visualThemes.length > 0 ? visualThemes : undefined,
      shots: sanitizedShots,
      totalShots: sanitizedShots.length,
      generatedBy: 'gemini',
    };
  }

  private sanitizeVisualPriority(val: any): VisualPriority {
    const valid: VisualPriority[] = ['critical', 'high', 'medium', 'supporting'];
    if (typeof val === 'string' && valid.includes(val.toLowerCase() as VisualPriority)) {
      return val.toLowerCase() as VisualPriority;
    }
    return 'high';
  }

  private sanitizePreferredVisualType(val: any): PreferredVisualType {
    const valid: PreferredVisualType[] = ['stock', 'custom', 'graphic', 'typography'];
    if (typeof val === 'string' && valid.includes(val.toLowerCase() as PreferredVisualType)) {
      return val.toLowerCase() as PreferredVisualType;
    }
    return 'stock';
  }

  private sanitizeSearchQueries(
    rawQueries: any,
    subject: string,
    action: string,
    environment: string
  ): string[] {
    const cleaned: string[] = [];
    const genericNoise = new Set([
      'video',
      'videos',
      '4k',
      'hd',
      'background',
      'backgrounds',
      'clip',
      'clips',
      'cinematic',
      'cool',
      'footage',
      'stock',
      'shot',
      'shots',
      'visual',
      'visuals',
    ]);

    if (Array.isArray(rawQueries)) {
      for (const q of rawQueries) {
        if (typeof q === 'string') {
          const trimmed = q
            .replace(/[^\w\s-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

          const words = trimmed.split(' ').filter((w) => !genericNoise.has(w));
          const refined = words.join(' ').trim();

          if (refined.length >= 3 && !cleaned.includes(refined)) {
            cleaned.push(refined);
          }
        }
      }
    } else if (typeof rawQueries === 'string') {
      const parts = rawQueries.split(/[,;\n]/);
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed.length >= 3 && !cleaned.includes(trimmed)) {
          cleaned.push(trimmed);
        }
      }
    }

    // Ensure we have at least 2-3 specific, high-signal queries
    if (cleaned.length < 2) {
      const subjectClean = subject.replace(/[^\w\s]/g, '').trim().toLowerCase();
      const envClean = environment.replace(/[^\w\s]/g, '').trim().toLowerCase();
      const actionClean = action.replace(/[^\w\s]/g, '').trim().toLowerCase();

      if (subjectClean && envClean) {
        const combo = `${subjectClean} ${envClean}`.slice(0, 50);
        if (!cleaned.includes(combo)) cleaned.push(combo);
      }
      if (subjectClean && actionClean) {
        const combo = `${subjectClean} ${actionClean}`.slice(0, 50);
        if (!cleaned.includes(combo)) cleaned.push(combo);
      }
      if (subjectClean) {
        if (!cleaned.includes(subjectClean)) cleaned.push(subjectClean);
      }
    }

    if (cleaned.length === 0) {
      cleaned.push('deep space astronomy', 'cosmic galaxy nebula');
    }

    return cleaned.slice(0, 4);
  }

  /**
   * Normalizes shot durations and builds continuous monotonic narrationStart/End timestamps
   * strictly bounded by [0, targetDuration].
   */
  private normalizeTimings(
    shots: StoryboardShot[],
    targetDuration: number,
    minDur: number,
    maxDur: number
  ): void {
    if (shots.length === 0) return;

    if (shots.length === 1) {
      shots[0].narrationStart = 0;
      shots[0].narrationEnd = Math.round(targetDuration * 100) / 100;
      shots[0].durationSeconds = shots[0].narrationEnd;
      return;
    }

    // Initial duration allocation based on existing proportions
    const rawSum = shots.reduce((acc, s) => acc + s.durationSeconds, 0) || 1;
    for (const s of shots) {
      s.durationSeconds = (s.durationSeconds / rawSum) * targetDuration;
    }

    // Bounding relaxation passes
    for (let iter = 0; iter < 10; iter++) {
      let excess = 0;
      let flexibleCount = 0;

      for (const s of shots) {
        if (s.durationSeconds > maxDur) {
          excess += s.durationSeconds - maxDur;
          s.durationSeconds = maxDur;
        } else if (s.durationSeconds < minDur) {
          excess -= minDur - s.durationSeconds;
          s.durationSeconds = minDur;
        } else {
          flexibleCount++;
        }
      }

      if (Math.abs(excess) < 0.01 || flexibleCount === 0) break;

      const adjustPerShot = excess / flexibleCount;
      for (const s of shots) {
        if (s.durationSeconds > minDur && s.durationSeconds < maxDur) {
          s.durationSeconds += adjustPerShot;
        }
      }
    }

    // Strict 2-decimal rounding sum
    let allocated = 0;
    for (let i = 0; i < shots.length - 1; i++) {
      shots[i].durationSeconds = Math.round(shots[i].durationSeconds * 100) / 100;
      allocated += shots[i].durationSeconds;
    }

    const lastDur = Math.round((targetDuration - allocated) * 100) / 100;
    shots[shots.length - 1].durationSeconds = lastDur;

    // Handle rounding edge cases if last shot fell slightly out of bounds
    if (shots[shots.length - 1].durationSeconds < minDur && shots.length > 1) {
      const diff = Math.round((minDur - shots[shots.length - 1].durationSeconds) * 100) / 100;
      shots[shots.length - 1].durationSeconds = minDur;
      shots[0].durationSeconds = Math.round((shots[0].durationSeconds - diff) * 100) / 100;
    }

    // Build contiguous timestamps [narrationStart, narrationEnd]
    let currentTime = 0;
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      s.narrationStart = Math.round(currentTime * 100) / 100;
      currentTime += s.durationSeconds;
      s.narrationEnd = Math.round(currentTime * 100) / 100;
    }

    // Ensure exact final endpoint match
    shots[shots.length - 1].narrationEnd = Math.round(targetDuration * 100) / 100;
    shots[shots.length - 1].durationSeconds =
      Math.round((shots[shots.length - 1].narrationEnd - shots[shots.length - 1].narrationStart) * 100) / 100;
  }

  private recordIssue(field: string, reason: string, actionTaken: string): void {
    this.issues.push({ field, reason, actionTaken });
  }
}
