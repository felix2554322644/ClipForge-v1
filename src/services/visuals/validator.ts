import { CustomSceneParams, CustomSceneType } from './types';

const VALID_SCENE_TYPES: CustomSceneType[] = [
  'kinetic_typography',
  'statistic_card',
  'timeline',
  'comparison',
  'diagram_flow',
  'behavioral_psychology',
  'ui_simulation',
  'visual_metaphor',
  'branded_transition',
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export class VisualSceneValidator {
  /**
   * Validates a custom scene object recommended by the AI Director or user request.
   */
  static validateSceneParams(params: any): ValidationResult {
    if (!params || typeof params !== 'object') {
      return { valid: false, error: 'Scene parameters must be a non-null object' };
    }

    const sceneType = params.type as CustomSceneType;
    if (!sceneType || !VALID_SCENE_TYPES.includes(sceneType)) {
      return {
        valid: false,
        error: `Invalid or missing scene type "${sceneType}". Must be one of: ${VALID_SCENE_TYPES.join(', ')}`,
      };
    }

    // Type-specific parameter checks
    switch (sceneType) {
      case 'kinetic_typography':
        if (!params.headline || typeof params.headline !== 'string') {
          return { valid: false, error: 'kinetic_typography requires a string headline' };
        }
        break;

      case 'statistic_card':
        if (!params.statValue || !params.statLabel) {
          return { valid: false, error: 'statistic_card requires statValue and statLabel' };
        }
        break;

      case 'timeline':
        if (!Array.isArray(params.events) || params.events.length === 0) {
          return { valid: false, error: 'timeline requires a non-empty events array' };
        }
        break;

      case 'comparison':
        if (!params.leftLabel || !params.rightLabel || !params.leftText || !params.rightText) {
          return { valid: false, error: 'comparison requires left/right labels and texts' };
        }
        break;

      case 'diagram_flow':
        if (!Array.isArray(params.nodes) || params.nodes.length === 0) {
          return { valid: false, error: 'diagram_flow requires a non-empty nodes array' };
        }
        break;

      case 'behavioral_psychology':
        if (!params.principleName || !params.keyTakeaway) {
          return { valid: false, error: 'behavioral_psychology requires principleName and keyTakeaway' };
        }
        break;

      case 'ui_simulation':
        if (!params.windowTitle || !params.actionCodeOrOutput) {
          return { valid: false, error: 'ui_simulation requires windowTitle and actionCodeOrOutput' };
        }
        break;

      case 'visual_metaphor':
        if (!params.metaphorTitle || !params.metaphorDescription) {
          return { valid: false, error: 'visual_metaphor requires metaphorTitle and metaphorDescription' };
        }
        break;

      case 'branded_transition':
        if (!params.brandName || !params.sectionTitle) {
          return { valid: false, error: 'branded_transition requires brandName and sectionTitle' };
        }
        break;
    }

    return { valid: true };
  }
}
