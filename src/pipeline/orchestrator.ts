import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppConfig, loadConfig, verifyDependencies } from '../config';
import { JobRecord } from '../contracts/job';
import { PipelineInput, PipelineOutput, PipelineStage, PipelineStageError } from '../contracts/pipeline';
import { PipelineLogger } from '../services/logging/logger';
import { GeminiClient } from '../services/gemini/client';
import { ResearchEngine } from '../services/research/researcher';
import { ScriptEngine } from '../services/scripting/scriptwriter';
import { PiperNarrationEngine } from '../services/narration/piper';
import { ScenePlanner } from '../services/scenes/planner';
import { PexelsProvider } from '../services/pexels/client';
import { BrollSearcher } from '../services/broll/searcher';
import { TimelineBuilder } from '../services/timeline/builder';
import { FFmpegRenderer } from '../services/rendering/ffmpegRenderer';
import { FFprobeValidator } from '../services/validation/ffprobeValidator';

export class PipelineOrchestrator {
  private config: AppConfig;

  constructor(customConfig?: AppConfig) {
    this.config = customConfig || loadConfig();
  }

  public async run(input: PipelineInput): Promise<PipelineOutput> {
    const topic = input.topic?.trim();
    if (!topic) {
      throw new Error('Pipeline error: "topic" is required.');
    }

    const duration = input.duration || 24;
    const profile = input.profile || 'vertical-1080';
    const jobId = input.jobId || `job_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const jobArtifactDir = input.outputDir
      ? path.resolve(input.outputDir)
      : path.join(this.config.artifactsDir, jobId);

    if (!fs.existsSync(jobArtifactDir)) {
      fs.mkdirSync(jobArtifactDir, { recursive: true });
    }

    const logger = new PipelineLogger(jobId, jobArtifactDir);
    logger.info('SYSTEM', `=== STARTING VIDEO GENERATION PIPELINE ===`);
    logger.info('SYSTEM', `Topic: "${topic}" | Duration: ${duration}s | Profile: ${profile} | JobId: ${jobId}`);

    // Verify dependencies and log warnings
    const deps = verifyDependencies(this.config, false);
    if (deps.warnings.length > 0) {
      deps.warnings.forEach((w) => logger.warn('SYSTEM', w));
    }

    // Initialize Job State
    const jobRecord: JobRecord = {
      jobId,
      topic,
      requestedDuration: duration,
      profile,
      status: 'running',
      currentStage: 'research',
      progress: 5,
      startedAt: new Date().toISOString(),
      artifactDir: jobArtifactDir,
    };
    this.saveJobRecord(jobArtifactDir, jobRecord);

    // Initialize Clients & Engines
    const geminiClient = new GeminiClient(this.config);
    const researchEngine = new ResearchEngine(geminiClient, logger);
    const scriptEngine = new ScriptEngine(geminiClient, logger);
    const narrationEngine = new PiperNarrationEngine(this.config, logger);
    const scenePlanner = new ScenePlanner(geminiClient, logger);
    const pexelsProvider = new PexelsProvider(this.config, logger);
    const brollSearcher = new BrollSearcher(pexelsProvider, this.config.cacheDir, logger);
    const timelineBuilder = new TimelineBuilder(logger);
    const renderer = new FFmpegRenderer(this.config, logger);
    const validator = new FFprobeValidator(this.config, logger);

    try {
      // 1. RESEARCH
      this.updateStage(jobArtifactDir, jobRecord, 'research', 10);
      const research = await researchEngine.conductResearch(topic, this.config.allowFallbacks);
      const researchPath = path.join(jobArtifactDir, 'research.json');
      fs.writeFileSync(researchPath, JSON.stringify(research, null, 2));

      // 2. SCRIPT
      this.updateStage(jobArtifactDir, jobRecord, 'script', 25);
      const script = await scriptEngine.generateScript(research, duration, this.config.allowFallbacks);
      const scriptPath = path.join(jobArtifactDir, 'script.json');
      fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2));

      // 3. NARRATION (Piper TTS + Audio Measurement)
      this.updateStage(jobArtifactDir, jobRecord, 'narration', 40);
      const narration = await narrationEngine.synthesizeNarration(script, jobArtifactDir, this.config.allowFallbacks);
      const narrationPath = path.join(jobArtifactDir, 'narration.json');
      fs.writeFileSync(narrationPath, JSON.stringify(narration, null, 2));

      // 4. SCENE PLANNING
      this.updateStage(jobArtifactDir, jobRecord, 'scene_planning', 55);
      const scenePlan = await scenePlanner.planScenes(script, narration, this.config.allowFallbacks);
      const scenePlanPath = path.join(jobArtifactDir, 'scene-plan.json');
      fs.writeFileSync(scenePlanPath, JSON.stringify(scenePlan, null, 2));

      // 5. B-ROLL SEARCH & SELECTION
      this.updateStage(jobArtifactDir, jobRecord, 'broll_selection', 70);
      const brollSelection = await brollSearcher.selectBrollForScenes(scenePlan, jobArtifactDir);
      const brollSelectionPath = path.join(jobArtifactDir, 'broll-selection.json');
      fs.writeFileSync(brollSelectionPath, JSON.stringify(brollSelection, null, 2));

      // 6. TIMELINE CONSTRUCTION (Master timing anchored to narration duration)
      this.updateStage(jobArtifactDir, jobRecord, 'timeline', 80);
      const timeline = timelineBuilder.buildTimeline(scenePlan, narration, brollSelection, profile);
      const timelinePath = path.join(jobArtifactDir, 'timeline.json');
      fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));

      // 7. FFMPEG RENDERING
      this.updateStage(jobArtifactDir, jobRecord, 'rendering', 90);
      const { outputPath, report } = await renderer.renderTimeline(timeline, jobArtifactDir, jobId);
      const renderReportPath = path.join(jobArtifactDir, 'render-report.json');
      fs.writeFileSync(renderReportPath, JSON.stringify(report, null, 2));

      // 8. FFPROBE VALIDATION
      this.updateStage(jobArtifactDir, jobRecord, 'validation', 98);
      const validation = validator.validateRenderedVideo(outputPath, profile, narration.audioDurationSec, jobArtifactDir);
      const validationPath = path.join(jobArtifactDir, 'validation.json');

      // 9. COMPLETE
      jobRecord.status = 'completed';
      jobRecord.currentStage = 'completed';
      jobRecord.progress = 100;
      jobRecord.completedAt = new Date().toISOString();
      jobRecord.outputPath = outputPath;
      this.saveJobRecord(jobArtifactDir, jobRecord);

      logger.info('SYSTEM', `=== PIPELINE EXECUTION SUCCESSFUL ===`);
      logger.info('SYSTEM', `Final Video: ${outputPath}`);
      logger.info('SYSTEM', `Duration: ${validation.actualMetrics.videoDurationSec}s | Resolution: ${validation.actualMetrics.width}x${validation.actualMetrics.height}`);

      return {
        jobId,
        success: true,
        finalVideoPath: outputPath,
        artifactDir: jobArtifactDir,
        validationPassed: validation.passed,
        totalDurationSec: validation.actualMetrics.videoDurationSec,
        artifacts: {
          research: researchPath,
          script: scriptPath,
          narration: narrationPath,
          scenePlan: scenePlanPath,
          brollSelection: brollSelectionPath,
          timeline: timelinePath,
          renderReport: renderReportPath,
          validation: validationPath,
        },
      };
    } catch (err: any) {
      jobRecord.status = 'failed';
      jobRecord.completedAt = new Date().toISOString();
      jobRecord.errorInfo = {
        stage: jobRecord.currentStage,
        message: err.message || String(err),
      };
      this.saveJobRecord(jobArtifactDir, jobRecord);

      logger.stageError(jobRecord.currentStage, err);
      logger.info('SYSTEM', `Pipeline failed at stage [${jobRecord.currentStage}]. Artifacts preserved at: ${jobArtifactDir}`);

      throw new PipelineStageError(jobRecord.currentStage, err.message || err);
    }
  }

  private updateStage(dir: string, job: JobRecord, stage: PipelineStage, progress: number) {
    job.currentStage = stage;
    job.progress = progress;
    this.saveJobRecord(dir, job);
  }

  private saveJobRecord(dir: string, job: JobRecord) {
    try {
      const p = path.join(dir, 'job.json');
      fs.writeFileSync(p, JSON.stringify(job, null, 2));
    } catch {
      // ignore
    }
  }
}
