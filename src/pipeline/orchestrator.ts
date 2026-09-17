import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config/index';
import { PipelineLogger } from '../services/logging/logger';
import { GeminiClient } from '../services/gemini/client';
import { ResearchService } from '../services/research/researcher';
import { ScriptwriterService } from '../services/scripting/scriptwriter';
import { PiperNarrationEngine } from '../services/narration/piper';
import { NarrationPreprocessor } from '../services/narration/textPreprocessor';
import { ForcedAligner } from '../services/narration/forcedAligner';
import { CaptionEngine } from '../services/captions/captionEngine';
import { AIStoryboardService } from '../services/storyboard/storyboardService';
import { ScenePlanner } from '../services/scenes/planner';
import { BrollSearcher } from '../services/broll/searcher';
import { EditorialEngine } from '../services/editorial/editorialEngine';
import { AIDirectorService } from '../services/editorial/director';
import { CLIPFORGE_NICHE_PROFILE } from '../services/editorial/profiles';
import { TimelineBuilder } from '../services/timeline/builder';
import { ProfessionalAudioMixer } from '../services/audio/mixer';
import { AudioPlanner } from '../services/audio/planner';
import { FfmpegRenderer } from '../services/rendering/ffmpegRenderer';
import { FfprobeValidator } from '../services/validation/ffprobeValidator';
import { FinalQualityControlService } from '../services/qc/finalQc';
import { FilmEditorCritiqueService } from '../services/qc/filmEditorCritique';
import { RenderSpecBuilder } from '../services/spec/renderSpecBuilder';
import { GeminiUsageGovernor, getGlobalGovernor } from '../services/governor/usageGovernor';
import { PipelineJob } from '../contracts/job';
import { ARTIFACT_FILES, getArtifactPath } from '../contracts/artifacts';
import { TopicManager } from '../services/topics/manager';

export class VideoPipelineOrchestrator {
  private logger: PipelineLogger;
  private gemini: GeminiClient;
  private governor: GeminiUsageGovernor;
  private topicManager: TopicManager;
  private researcher: ResearchService;
  private scriptwriter: ScriptwriterService;
  private narrationEngine: PiperNarrationEngine;
  private captionEngine: CaptionEngine;
  private storyboardService: AIStoryboardService;
  private scenePlanner: ScenePlanner;
  private brollSearcher: BrollSearcher;
  private editorialEngine: EditorialEngine;
  private editorialDirector: AIDirectorService;
  private audioMixer: ProfessionalAudioMixer;
  private timelineBuilder: TimelineBuilder;
  private renderer: FfmpegRenderer;
  private validator: FfprobeValidator;
  private qcService: FinalQualityControlService;
  private filmCritiqueService: FilmEditorCritiqueService;

  constructor(
    geminiClient?: GeminiClient,
    topicManager?: TopicManager,
    editorialDirector?: AIDirectorService,
    storyboardService?: AIStoryboardService,
    audioMixer?: ProfessionalAudioMixer,
    qcService?: FinalQualityControlService,
    governor?: GeminiUsageGovernor
  ) {
    this.logger = new PipelineLogger();
    this.gemini = geminiClient || new GeminiClient({ logger: this.logger });
    this.governor = governor || this.gemini.getGovernor() || getGlobalGovernor();
    this.topicManager =
      topicManager ||
      new TopicManager({ logger: this.logger, geminiClient: this.gemini });
    this.researcher = new ResearchService(this.gemini, this.logger);
    this.scriptwriter = new ScriptwriterService(this.gemini, this.logger);
    this.narrationEngine = new PiperNarrationEngine(this.logger);
    this.captionEngine = new CaptionEngine(this.logger);
    this.storyboardService =
      storyboardService ||
      new AIStoryboardService({
        geminiClient: this.gemini,
        logger: this.logger,
      });
    this.scenePlanner = new ScenePlanner(this.logger);
    this.brollSearcher = new BrollSearcher(this.logger, { governor: this.governor });
    this.editorialEngine = new EditorialEngine(this.logger);
    this.editorialDirector =
      editorialDirector ||
      new AIDirectorService({
        geminiClient: this.gemini,
        deterministicEngine: this.editorialEngine,
        logger: this.logger,
        governor: this.governor,
      });
    this.audioMixer = audioMixer || new ProfessionalAudioMixer(this.logger);
    this.timelineBuilder = new TimelineBuilder(this.logger);
    this.renderer = new FfmpegRenderer(this.logger);
    this.validator = new FfprobeValidator(this.logger);
    this.qcService = qcService || new FinalQualityControlService(this.logger, this.gemini);
    this.filmCritiqueService = new FilmEditorCritiqueService(this.logger, this.gemini);
  }

  async runJob(
    topicInput?: string,
    outputDirectory?: string,
    options?: { duration?: number; profile?: string }
  ): Promise<PipelineJob> {
    const resolved = await this.topicManager.resolveTopic(topicInput);
    const activeTopic = resolved.topic;
    const topicMode = resolved.mode;

    const jobId = `job_${Date.now()}_${Math.random().toString(16).substring(2, 8)}`;
    const jobDir = outputDirectory || path.join(CONFIG.OUTPUT_DIR, jobId);

    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }

    this.logger.setLogDirectory(jobDir);
    this.logger.info(`Starting video pipeline job: ${jobId} (mode: ${topicMode}) for topic: "${activeTopic}"`);

    this.governor.reset();

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

      // 2. High-Retention Scriptwriting (5-Beat Everyday Curiosity structure)
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
      const combinedNarrationText = NarrationPreprocessor.joinSceneNarrations(script.scenes);
      const narrationArtifact = await this.narrationEngine.synthesizeSpeech(
        combinedNarrationText,
        narrationWavPath
      );
      this.saveArtifact(jobDir, ARTIFACT_FILES.NARRATION_JSON, narrationArtifact);

      // 3b. Forced Word-Level Alignment
      const wordTimestamps = ForcedAligner.alignAudio(
        narrationWavPath,
        combinedNarrationText,
        this.logger
      );

      // 3c. Generate Synchronized Captions
      const captionsAssPath = getArtifactPath(jobDir, 'CAPTIONS_ASS');
      const { segments: captions } = this.captionEngine.generateCaptions(
        combinedNarrationText,
        narrationArtifact.durationSeconds,
        captionsAssPath
      );
      this.saveArtifact(jobDir, ARTIFACT_FILES.CAPTIONS_JSON, captions);

      const videoFormat =
        options?.profile === 'long' || job.profile === 'long' ? 'long' : 'short';

      // 4. AI Storyboard + Visual Intent Generation
      job.currentStage = 'STORYBOARD';
      job.progressPercent = 50;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);

      const storyboard = await this.storyboardService.generateStoryboard({
        script,
        narrationText: combinedNarrationText,
        narrationDurationSeconds: narrationArtifact.durationSeconds,
        format: videoFormat,
        nicheProfile: CLIPFORGE_NICHE_PROFILE,
      });
      this.saveArtifact(jobDir, ARTIFACT_FILES.STORYBOARD, storyboard);

      // 4b. Beat-Level Scene Planning
      job.currentStage = 'SCENE_PLANNING';
      job.progressPercent = 55;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const scenePlan = this.scenePlanner.planScenes(script, narrationArtifact.durationSeconds);
      scenePlan.captions = captions;
      this.saveArtifact(jobDir, ARTIFACT_FILES.SCENE_PLAN, scenePlan);

      // 5. Multi-Shot B-Roll Candidate Board Assembly (Zero-Fabrication Mandate)
      job.currentStage = 'BROLL_SELECTION';
      job.progressPercent = 70;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const candidateBoard = await this.brollSearcher.buildCandidateBoard(storyboard);
      this.saveArtifact(jobDir, ARTIFACT_FILES.CANDIDATE_BOARD, candidateBoard);

      // 5b. AI Editorial Director
      job.currentStage = 'EDITORIAL_DECISION';
      job.progressPercent = 75;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);

      const editorialPlan = await this.editorialDirector.directVideo({
        nicheProfile: CLIPFORGE_NICHE_PROFILE,
        format: videoFormat,
        targetDurationSeconds: narrationArtifact.durationSeconds,
        script,
        narrationText: combinedNarrationText,
        narrationDurationSeconds: narrationArtifact.durationSeconds,
        storyboard,
        scenePlan,
        candidateBoard,
      });

      // Materialize and reframe the selected real stock video assets
      await this.brollSearcher.materializeEditorialPlan(
        editorialPlan,
        candidateBoard,
        jobDir
      );
      this.saveArtifact(jobDir, ARTIFACT_FILES.EDITORIAL, editorialPlan);

      // Re-burn ASS captions with editorial moment synchronization
      const synchronizedAssPath = getArtifactPath(jobDir, 'CAPTIONS_ASS');
      this.captionEngine.generateCaptions(
        combinedNarrationText,
        narrationArtifact.durationSeconds,
        synchronizedAssPath,
        editorialPlan
      );

      // 6. Professional Audio Mixing (Narration + Ducked Music Bed + Layered Ambience + SFX)
      job.currentStage = 'AUDIO_MIXING';
      job.progressPercent = 80;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);

      const audioPlan = AudioPlanner.planAudio({
        totalDurationSeconds: narrationArtifact.durationSeconds,
        editorialPlan,
        script,
        researchBrief: brief,
      });
      this.saveArtifact(jobDir, ARTIFACT_FILES.AUDIO_PLAN_JSON, audioPlan);

      const masterAudioWavPath = getArtifactPath(jobDir, 'MASTER_AUDIO_WAV');
      const audioProbe = this.audioMixer.mixAudio(
        narrationWavPath,
        masterAudioWavPath,
        {
          targetDurationSeconds: narrationArtifact.durationSeconds,
          audioPlan,
          editorialPlan,
          script,
          researchBrief: brief,
        }
      );
      const finalAudioPath = masterAudioWavPath;
      this.logger.info(
        `Master audio mix created at ${masterAudioWavPath} (${audioProbe.durationSeconds.toFixed(2)}s)`
      );

      // 6b. Build Authoritative RenderSpec (Contract between brain and hands)
      const renderSpec = RenderSpecBuilder.build({
        jobId,
        topic: activeTopic,
        durationSeconds: narrationArtifact.durationSeconds,
        script,
        brief,
        editorialPlan,
        audioPlan,
        masterAudioPath: finalAudioPath,
        narrationAudioPath: narrationWavPath,
        wordTimestamps,
      });
      this.saveArtifact(jobDir, ARTIFACT_FILES.RENDER_SPEC, renderSpec);
      this.logger.info(`Authoritative RenderSpec built and saved to ${ARTIFACT_FILES.RENDER_SPEC}`);

      // 7. Timeline Building (Multi-shot with burned-in caption directives & editorial decisions)
      job.currentStage = 'TIMELINE_BUILDING';
      job.progressPercent = 85;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const timeline = this.timelineBuilder.buildTimelineFromEditorial(
        editorialPlan,
        finalAudioPath,
        captions,
        synchronizedAssPath
      );
      job.duration = timeline.totalDurationSeconds;
      this.saveArtifact(jobDir, ARTIFACT_FILES.TIMELINE, timeline);

      // 8. Video Composite Rendering
      job.currentStage = 'RENDERING';
      job.progressPercent = 92;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const finalVideoPath = getArtifactPath(jobDir, 'FINAL_VIDEO');
      const renderReport = await this.renderer.render(timeline, finalVideoPath);
      this.saveArtifact(jobDir, ARTIFACT_FILES.RENDER_REPORT, renderReport);

      // 9. Quality Validation (tight duration tolerance <= 0.4s)
      job.currentStage = 'VALIDATION';
      job.progressPercent = 95;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const validation = this.validator.validate(finalVideoPath, timeline.totalDurationSeconds);
      this.saveArtifact(jobDir, ARTIFACT_FILES.VALIDATION, validation);

      if (!validation.isValid) {
        throw new Error(`Quality validation failed: ${validation.errors.join(', ')}`);
      }

      // 10. Final Quality Control (Dense frame sampling + explicit audio check)
      job.currentStage = 'FINAL_QC';
      job.progressPercent = 97;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const qcReport = await this.qcService.evaluateVideo(
        finalVideoPath,
        timeline.totalDurationSeconds,
        {
          editorialPlan,
          topic: activeTopic,
          script,
        }
      );
      this.saveArtifact(jobDir, ARTIFACT_FILES.FINAL_QC, qcReport);

      if (!qcReport.pass) {
        throw new Error(
          `Final Quality Control inspection failed (Score: ${qcReport.overallScore}/100): ${qcReport.summary || 'QC criteria not met'}`
        );
      }

      // 11. Second-Pass Film Editor Critique
      job.currentStage = 'FILM_CRITIQUE';
      job.progressPercent = 99;
      this.saveArtifact(jobDir, ARTIFACT_FILES.JOB, job);
      const filmCritiquePath = getArtifactPath(jobDir, 'FILM_CRITIQUE');
      const critiqueReport = await this.filmCritiqueService.critiqueVideo(
        renderSpec,
        filmCritiquePath
      );
      this.saveArtifact(jobDir, ARTIFACT_FILES.FILM_CRITIQUE, critiqueReport);

      // 12. Export single production deliverable (final MP4 only)
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
    } finally {
      const rotationContext = this.gemini.getRotationContext();
      const report = this.governor.generateReportString(rotationContext);
      console.log('\n' + report + '\n');
      this.logger.info('\n' + report);
      const taskReport = this.gemini.getTaskRoutingReport();
      console.log('\n' + taskReport + '\n');
      this.logger.info('\n' + taskReport);
      try {
        this.saveArtifact(jobDir, 'gemini-usage-report.json', this.governor.getSummaryReport());
        fs.writeFileSync(path.join(jobDir, 'gemini-usage-report.txt'), report, 'utf-8');
        this.saveArtifact(jobDir, 'gemini-routing-report.json', this.gemini.getTaskRouter().getMetrics());
        fs.writeFileSync(path.join(jobDir, 'gemini-routing-report.txt'), taskReport, 'utf-8');
      } catch {
        // non-blocking
      }
    }
  }

  private saveArtifact(jobDir: string, filename: string, data: any): void {
    const artifactPath = path.join(jobDir, filename);
    fs.writeFileSync(artifactPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  exportProductionDeliverable(finalVideoPath: string, destinationDir?: string): string {
    const targetDir = destinationDir || path.join(CONFIG.OUTPUT_DIR, 'dist');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const outputPath = path.join(targetDir, ARTIFACT_FILES.PRODUCTION_MP4);
    fs.copyFileSync(finalVideoPath, outputPath);
    return outputPath;
  }
}
