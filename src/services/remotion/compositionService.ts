import path from 'node:path';
import fs from 'node:fs';
import { RemotionSceneRenderer } from './renderer';
import { PipelineLogger } from '../logging/logger';
import {
  CustomSceneParams,
  RenderResult,
  KineticTypographyParams,
  StatisticCardParams,
  TimelineParams,
  ComparisonParams,
  DiagramFlowParams,
  BehavioralPsychologyParams,
  UiSimulationParams,
  VisualMetaphorParams,
  BrandedTransitionParams,
} from './types';
import { VideoFormat } from '../../types/editorial';

export class RemotionCompositionService {
  private renderer: RemotionSceneRenderer;
  private logger?: PipelineLogger;

  constructor(logger?: PipelineLogger) {
    this.logger = logger;
    this.renderer = new RemotionSceneRenderer(logger);
  }

  getRenderer(): RemotionSceneRenderer {
    return this.renderer;
  }

  /**
   * Pre-warms the Remotion bundle and headless browser in the background.
   */
  async prewarm(): Promise<void> {
    try {
      this.logger?.info('[REMOTION SERVICE] Pre-warming composition bundle in background...');
      await this.renderer.getServeUrl();
      this.logger?.info('[REMOTION SERVICE] Bundle ready.');
    } catch (err) {
      this.logger?.warn(`[REMOTION SERVICE] Prewarm warning: ${(err as Error).message}`);
    }
  }

  /**
   * Renders a custom visual scene with standard defaults.
   */
  async renderScene(
    sceneParams: CustomSceneParams,
    durationSeconds = 3.5,
    format: VideoFormat = 'short',
    outputPath?: string
  ): Promise<RenderResult> {
    return this.renderer.renderScene({
      sceneParams,
      durationSeconds,
      format,
      outputPath,
      fps: 30,
    });
  }

  /**
   * Helper to build Kinetic Typography scene params.
   */
  buildKineticTypography(
    headline: string,
    emphasisWord?: string,
    subtitle?: string,
    accentColor = '#F5A623'
  ): KineticTypographyParams {
    return {
      type: 'kinetic_typography',
      headline,
      emphasisWord: emphasisWord || headline.split(' ')[0],
      subtitle,
      accentColor,
    };
  }

  /**
   * Helper to build Statistic Card scene params.
   */
  buildStatisticCard(
    statValue: string,
    statLabel: string,
    contextNote?: string,
    trend: 'up' | 'down' | 'neutral' = 'up',
    accentColor = '#10B981'
  ): StatisticCardParams {
    return {
      type: 'statistic_card',
      statValue,
      statLabel,
      contextNote,
      trend,
      accentColor,
    };
  }

  /**
   * Helper to build Diagram Flow scene params.
   */
  buildDiagramFlow(
    title: string,
    nodes: Array<{ id: string; label: string; sublabel?: string }>,
    accentColor = '#38BDF8'
  ): DiagramFlowParams {
    return {
      type: 'diagram_flow',
      title,
      nodes,
      accentColor,
    };
  }

  /**
   * Helper to build Comparison scene params.
   */
  buildComparison(
    title: string,
    leftLabel: string,
    leftText: string,
    rightLabel: string,
    rightText: string,
    accentColor = '#38BDF8'
  ): ComparisonParams {
    return {
      type: 'comparison',
      title,
      leftLabel,
      leftText,
      rightLabel,
      rightText,
      accentColor,
    };
  }
}
