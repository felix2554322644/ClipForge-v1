import { VideoFormat } from '../../types/pipeline';
import type {
  CustomSceneParams,
  RenderSceneOptions,
  RenderResult,
} from '../visuals/types';

export type RemotionSceneType =
  | 'kinetic_typography'
  | 'statistic_card'
  | 'timeline'
  | 'comparison'
  | 'diagram_flow'
  | 'behavioral_psychology'
  | 'ui_simulation'
  | 'visual_metaphor'
  | 'branded_transition'
  | 'motion_cut';

export interface RemotionBaseProps {
  durationInFrames?: number;
  width?: number;
  height?: number;
  fps?: number;
  accentColor?: string;
  title?: string;
  subtitle?: string;
}

export interface KineticTypographyParams extends RemotionBaseProps {
  type: 'kinetic_typography';
  headline?: string;
  emphasisWord?: string;
  highlightColor?: string;
}

export interface StatisticCardParams extends RemotionBaseProps {
  type: 'statistic_card';
  statValue?: string;
  statLabel?: string;
  contextNote?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface TimelineEventItem {
  yearOrTime?: string;
  time?: string;
  label?: string;
  title?: string;
  description?: string;
  active?: boolean;
}

export interface TimelineParams extends RemotionBaseProps {
  type: 'timeline';
  events?: TimelineEventItem[];
}

export interface ComparisonParams extends RemotionBaseProps {
  type: 'comparison';
  leftLabel?: string;
  leftText?: string;
  leftPoints?: string[];
  rightLabel?: string;
  rightText?: string;
  rightPoints?: string[];
  versusText?: string;
}

export interface DiagramFlowStep {
  label?: string;
  description?: string;
}

export interface DiagramFlowNode {
  id?: string;
  label: string;
  sublabel?: string;
  status?: 'active' | 'pending' | 'highlight';
}

export interface DiagramFlowParams extends RemotionBaseProps {
  type: 'diagram_flow';
  steps?: DiagramFlowStep[];
  nodes?: DiagramFlowNode[];
  highlightIndex?: number;
  flowDirection?: 'horizontal' | 'vertical';
}

export interface BehavioralPsychologyParams extends RemotionBaseProps {
  type: 'behavioral_psychology';
  principleName?: string;
  biasOrMechanism?: string;
  takeaway?: string;
  keyTakeaway?: string;
  metricBarPercent?: number;
}

export interface UiSimulationParams extends RemotionBaseProps {
  type: 'ui_simulation';
  appName?: string;
  windowTitle?: string;
  queryOrCommand?: string;
  actionCodeOrOutput?: string;
}

export interface VisualMetaphorParams extends RemotionBaseProps {
  type: 'visual_metaphor';
  concept?: string;
  metaphorTitle?: string;
  metaphorDescription?: string;
  scaleFactor?: string;
}

export interface BrandedTransitionParams extends RemotionBaseProps {
  type: 'branded_transition';
  channelName?: string;
  brandName?: string;
  topicTitle?: string;
  sectionTitle?: string;
  tagline?: string;
}

export interface MotionCutParams {
  type: 'motion_cut';
  videoSourcePath?: string;
  imageSourcePath?: string;
  headline?: string;
  motionEffect?:
    | 'push_in'
    | 'pull_out'
    | 'punch_in'
    | 'pan_left'
    | 'pan_right'
    | 'tilt_up'
    | 'tilt_down'
    | 'static'
    | 'zoom_in'
    | 'zoom_out';
  cropMode?: 'standard' | 'punch_in' | 'tight' | 'wide';
  patternInterrupt?: {
    type: 'punch_in' | 'statistic_callout' | 'visual_reveal' | 'crop_reframe' | 'text_flash';
    label?: string;
    intensity: 'subtle' | 'bold';
  };
  captionTreatment?: string;
  durationInFrames?: number;
}

export type AnyRemotionSceneProps =
  | KineticTypographyParams
  | StatisticCardParams
  | TimelineParams
  | ComparisonParams
  | DiagramFlowParams
  | BehavioralPsychologyParams
  | UiSimulationParams
  | VisualMetaphorParams
  | BrandedTransitionParams
  | MotionCutParams;

export type {
  CustomSceneParams,
  RenderSceneOptions,
  RenderResult,
};
