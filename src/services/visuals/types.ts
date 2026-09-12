import { VideoFormat } from '../../types/editorial';

export type CustomSceneType =
  | 'kinetic_typography'
  | 'statistic_card'
  | 'timeline'
  | 'comparison'
  | 'diagram_flow'
  | 'behavioral_psychology'
  | 'ui_simulation'
  | 'visual_metaphor'
  | 'branded_transition';

export interface BaseSceneParams {
  title?: string;
  subtitle?: string;
  accentColor?: string;
}

export interface KineticTypographyParams extends BaseSceneParams {
  type: 'kinetic_typography';
  headline: string;
  emphasisWord?: string;
  highlightColor?: string;
}

export interface StatisticCardParams extends BaseSceneParams {
  type: 'statistic_card';
  statValue: string;
  statLabel: string;
  contextNote?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface TimelineEvent {
  yearOrTime: string;
  label: string;
  description?: string;
  active?: boolean;
}

export interface TimelineParams extends BaseSceneParams {
  type: 'timeline';
  events: TimelineEvent[];
}

export interface ComparisonParams extends BaseSceneParams {
  type: 'comparison';
  leftLabel: string;
  leftText: string;
  rightLabel: string;
  rightText: string;
  versusText?: string;
}

export interface DiagramNode {
  id: string;
  label: string;
  sublabel?: string;
  status?: 'active' | 'pending' | 'highlight';
}

export interface DiagramFlowParams extends BaseSceneParams {
  type: 'diagram_flow';
  nodes: DiagramNode[];
  flowDirection?: 'horizontal' | 'vertical';
}

export interface BehavioralPsychologyParams extends BaseSceneParams {
  type: 'behavioral_psychology';
  principleName: string;
  keyTakeaway: string;
  metricBarPercent?: number;
}

export interface UiSimulationParams extends BaseSceneParams {
  type: 'ui_simulation';
  appName: string;
  windowTitle: string;
  actionCodeOrOutput: string;
}

export interface VisualMetaphorParams extends BaseSceneParams {
  type: 'visual_metaphor';
  metaphorTitle: string;
  metaphorDescription: string;
  scaleFactor?: string;
}

export interface BrandedTransitionParams extends BaseSceneParams {
  type: 'branded_transition';
  brandName: string;
  sectionTitle: string;
}

export type CustomSceneParams =
  | KineticTypographyParams
  | StatisticCardParams
  | TimelineParams
  | ComparisonParams
  | DiagramFlowParams
  | BehavioralPsychologyParams
  | UiSimulationParams
  | VisualMetaphorParams
  | BrandedTransitionParams;

export interface RenderSceneOptions {
  sceneParams: CustomSceneParams;
  format: VideoFormat; // 'short' (1080x1920) or 'landscape' (1920x1080)
  durationSeconds: number;
  fps?: number;
  outputPath?: string;
}

export interface RenderResult {
  success: boolean;
  filePath?: string;
  mimeType: string;
  width: number;
  height: number;
  durationSeconds: number;
  error?: string;
}
