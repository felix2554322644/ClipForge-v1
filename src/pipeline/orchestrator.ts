import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config/index';
import { PipelineLogger } from '../services/logging/logger';
import { GeminiClient } from '../services/gemini/client';
import { ResearchService } from '../services/research/researcher';
import { ScriptwriterService } from '../services/scripting/scriptwriter';
import { PiperNarrationEngine } from '../services/narration/piper';
import { CaptionEngine } from '../services/captions/captionEngine';
import { ScenePlanner } from '../services/scenes/planner';
import { BrollSearcher } from '../services/broll/searcher';
import { EditorialEngine } from '../services/editorial/editorialEngine';
import { TimelineBuilder } from '../services/timeline/builder';
import { FfmpegRenderer } from '../services/rendering/ffmpegRenderer';
import { FfprobeValidator } from '../services/validation/ffprobeValidator';
import { PipelineJob } from '../contracts/job';
import { ARTIFACT_FILES, getArtifactPath } from '../contracts/artifacts';
import { TopicManager } from '../services/topics/manager';

export class VideoPipelineOrchestrator {
  private logger: PipelineLogger;
  private gemini: GeminiClient;
  private topicManager: TopicManager;
  private researcher: ResearchService;
  private scriptwriter: ScriptwriterService;
  private narrationEngine: PiperNarrationEngine;
  private captionEngine: CaptionEngine;
  private scenePlanner: ScenePlanner;
  private brollSearcher: BrollSearcher;
  private editorialEngine: EditorialEngine;
  private timelineBuilder: TimelineBuilder;
  private renderer: FfmpegRenderer;
  private validator: FfprobeValidator;

  constructor(geminiClient?: GeminiClient, topicManager?: TopicManager) {
    this.logger = new PipelineLogger();
    this.gemini = geminiClient || new GeminiClient();
    this.topicManager = topicManager || new TopicManager({ logger: this.logger });
    this.researcher = new ResearchService(this.gemini, this.logger);
    this.scriptwriter = new ScriptwriterService(this.gemini, this.logger);
    this.narrationEngine = new PiperNarrationEngine(this.logger);
    this.captionEngine = new CaptionEngine(this.logger);
    this.scenePlanner = new ScenePlanner(this.logger);
    this.brollSearcher = new BrollSearcher(this.logger);
    this.editorialEngine = new EditorialEngine(this.logger);
    this.timelineBuilder = new TimelineBuilder(this.logger);
    this.renderer = new FfmpegRenderer(this.logger);
    this.validator = new FfprobeValidator(this.logger);
  }

  async runJob(
    topicInput?: string,
    outputDirectory?: string,
    options?: { duration?: number; profile?: string }
  ): Promise<PipelineJob> {
    const resolved = this.topicManager.resolveTopic(topicInput);
    const activeTopic = resolved.topic;
    const topicMode = resolved.mode;

    const jobId = `job_${Date.now()}_${Math.random().toString(16).substring(2, 8)}`;
    const jobDir = outputDirectory || path.join(CONFIG.OUTPUT_DIR, jobId);

    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }

    this.logger.setLogDirectory(jobDir);
    this.logger.info(`Starting video pipeline job: ${jobId} (mode: ${topicMode}) for topic: "${activeTopic}"`);

    const job: PipelineJob = {
      id: jobId,
      jobId,
      topic: activeTopic,
      topicMode,
      duration: options?.duration || 30,
      profile: options?.profile || 'vertical-1080',
      status: 'RUNNING',
      currentStage: 'RESEARCH',
      progressPercent: 5,
      startedAt: new Date().toISOString(),
      outputDirectory: jobDir,
    };

    this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);

    try {
      // 1. Deep Research
      job.currentStage = 'RESEARCH';
      job.progressPercent = 15;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const brief = await this.researcher.conductResearch(activeTopic);
      this.saveArtifact(jobDir, ARTIFACT_FILES.RESEARCH, brief);

      // 2. High-Retention Scriptwriting
      job.currentStage = 'SCRIPTING';
      job.progressPercent = 30;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const script = await this.scriptwriter.generateScript(brief);
      this.saveArtifact(jobDir, ARTIFACT_FILES.SCRIPT, script);

      // 3. Narration (Synthesize master speech via Piper)
      job.currentStage = 'NARRATION';
      job.progressPercent = 45;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const narrationWavPath = getArtifactPath(jobDir, 'NARRATION_WAV');
      const combinedNarrationText = script.scenes.map((s) => s.narration).join(' ... ');
      const narrationArtifact = await this.narrationEngine.synthesizeSpeech(
        combinedNarrationText,
        narrationWavPath
      );
      this.saveArtifact(jobDir, ARTIFACT_FILES.NARRATION_JSON, narrationArtifact);

      // 3b. Generate Synchronized Captions
      const captionsAssPath = getArtifactPath(jobDir, 'CAPTIONS_ASS');
      const { segments: captions, assPath: captionAssFile } = this.captionEngine.generateCaptions(
        combinedNarrationText,
        narrationArtifact.durationSeconds,
        captionsAssPath
      );
      this.saveArtifact(jobDir, ARTIFACT_FILES.CAPTIONS_JSON, captions);

      // 4. Beat-Level Scene Planning
      job.currentStage = 'SCENE_PLANNING';
      job.progressPercent = 55;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      // Authoritative duration anchor is the synthesized audio duration
      const scenePlan = this.scenePlanner.planScenes(script, narrationArtifact.durationSeconds);
      scenePlan.captions = captions;
      this.saveArtifact(jobDir, ARTIFACT_FILES.SCENE_PLAN, scenePlan);

      // 5. Multi-Shot B-Roll Selection & Reframing
      job.currentStage = 'BROLL_SELECTION';
      job.progressPercent = 70;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const brollSelections = await this.brollSearcher.selectBrollForScenes(
        scenePlan.scenes,
        jobDir
      );
      this.saveArtifact(jobDir, ARTIFACT_FILES.BROLL_SELECTION, brollSelections);

      // 5b. Retention-Optimized Editorial Decision Layer
      job.currentStage = 'EDITORIAL_DECISION';
      job.progressPercent = 75;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const editorialPlan = this.editorialEngine.makeEditorialDecisions({
        scenePlan,
        brollSelections,
        script,
        totalDurationSeconds: narrationArtifact.durationSeconds,
        researchBrief: brief,
        captions,
      });
      this.saveArtifact(jobDir, ARTIFACT_FILES.EDITORIAL, editorialPlan);

      // Re-burn ASS captions with editorial moment synchronization
      const synchronizedAssPath = getArtifactPath(jobDir, 'CAPTIONS_ASS');
      this.captionEngine.generateCaptions(
        combinedNarrationText,
        narrationArtifact.durationSeconds,
        synchronizedAssPath,
        editorialPlan
      );

      // 6. Timeline Building (Multi-shot with burned-in caption directives & editorial decisions)
      job.currentStage = 'TIMELINE_BUILDING';
      job.progressPercent = 82;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const timeline = this.timelineBuilder.buildTimelineFromEditorial(
        editorialPlan,
        narrationWavPath,
        captions,
        synchronizedAssPath
      );
      job.duration = timeline.totalDurationSeconds;
      this.saveArtifact(jobDir, ARTIFACT_FILES.TIMELINE, timeline);

      // 7. Video Composite Rendering (burns in ASS captions, enforces exact audio duration)
      job.currentStage = 'RENDERING';
      job.progressPercent = 90;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const finalVideoPath = getArtifactPath(jobDir, 'FINAL_VIDEO');
      const renderReport = await this.renderer.render(timeline, finalVideoPath);
      this.saveArtifact(jobDir, ARTIFACT_FILES.RENDER_REPORT, renderReport);

      // 8. Quality Validation (tight duration tolerance <= 0.4s)
      job.currentStage = 'VALIDATION';
      job.progressPercent = 98;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const validation = this.validator.validate(finalVideoPath, timeline.totalDurationSeconds);
      this.saveArtifact(jobDir, ARTIFACT_FILES.VALIDATION, validation);

      if (!validation.isValid) {
        throw new Error(`Quality validation failed: ${validation.errors.join(', ')}`);
      }

      // 8b. Export single production deliverable (PART 12: final MP4 only)
      const productionMp4Path = path.join(CONFIG.OUTPUT_DIR, ARTIFACT_FILES.PRODUCTION_MP4);
      fs.copyFileSync(finalVideoPath, productionMp4Path);
      const jobProductionPath = getArtifactPath(jobDir, 'PRODUCTION_MP4');
      if (jobProductionPath !== productionMp4Path) {
        fs.copyFileSync(finalVideoPath, jobProductionPath);
      }

      job.status = 'COMPLETED';
      job.currentStage = 'COMPLETED';
      job.progressPercent = 100;
      job.finalVideoPath = finalVideoPath;
      job.completedAt = new Date().toISOString();
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);

      this.logger.info(`🎉 Pipeline completed successfully! Final video: ${finalVideoPath}`);
      return job;
    } catch (err) {
      job.status = 'FAILED';
      job.currentStage = 'FAILED';
      job.errorMessage = (err as Error).message;
      job.completedAt = new Date().toISOString();
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);

      this.logger.error(`❌ Pipeline execution failed: ${job.errorMessage}`);
      throw err;
    }
  }

  private saveArtifact(jobDir: string, filename: string, data: any): void {
    const artifactPath = path.join(jobDir, filename);
    fs.writeFileSync(artifactPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Packages the production deliverable containing ONLY the final rendered MP4.
   * Eliminates all intermediate json, wav, cut fragments, and downloaded b-roll.
   */
  exportProductionDeliverable(finalVideoPath: string, destinationDir?: string): string {
    const targetDir = destinationDir || path.join(CONFIG.OUTPUT_DIR, 'dist');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, ARTIFACT_FILES.PRODUCTION_MP4);
    fs.copyFileSync(finalVideoPath, targetPath);
    return targetPath;
  }
}
