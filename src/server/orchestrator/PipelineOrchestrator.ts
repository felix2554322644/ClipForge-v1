import fs from 'fs/promises';
import path from 'path';
import {
  PipelineInput,
  JobRecord,
  PipelineStage,
  SelectedBrollClip,
  BrollSelectionArtifact,
} from '../../types/pipeline.js';
import { config, parseResolutionProfile } from '../config.js';
import { logger } from '../logger.js';
import { jobStore } from '../jobStore.js';
import { researchService } from '../services/ResearchService.js';
import { scriptService } from '../services/ScriptService.js';
import { narrationService } from '../services/NarrationService.js';
import { scenePlanner } from '../services/ScenePlanner.js';
import { brollProvider } from '../services/BrollProvider.js';
import { brollSelector } from '../services/BrollSelector.js';
import { timelineBuilder } from '../services/TimelineBuilder.js';
import { renderer } from '../services/Renderer.js';
import { validator } from '../services/Validator.js';

export class PipelineOrchestrator {
  public async executePipeline(input: PipelineInput, customJobId?: string): Promise<JobRecord> {
    const jobId = customJobId || `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const jobDir = path.join(config.jobsDir, jobId);
    const artifactsDir = path.join(jobDir, 'artifacts');
    await fs.mkdir(artifactsDir, { recursive: true });

    const resolution = parseResolutionProfile(input.resolutionProfile);
    const targetFps = input.targetFps || config.defaultFps;

    const jobRecord: JobRecord = {
      jobId,
      input,
      currentStage: 'queued',
      status: 'running',
      progress: 0,
      startedAt: new Date().toISOString(),
      artifacts: {},
      logs: [],
    };

    // Attach logger listener to record logs into jobRecord
    const unsubscribeLogger = logger.subscribe(jobId, entry => {
      jobRecord.logs.push(entry);
    });

    await jobStore.saveJob(jobRecord);
    logger.info(jobId, 'queued', `Job created for topic: "${input.topic}" (${resolution.width}x${resolution.height} @ ${targetFps}fps)`);

    try {
      // ----------------------------------------------------
      // STAGE 1: RESEARCH
      // ----------------------------------------------------
      this.updateStage(jobRecord, 'research', 10);
      await jobStore.saveJob(jobRecord);

      const research = await researchService.conductResearch(jobId, input);
      jobRecord.artifacts.research = research;
      await this.saveArtifact(artifactsDir, 'research.json', research);
      await jobStore.saveJob(jobRecord);

      // ----------------------------------------------------
      // STAGE 2: STORY / SCRIPT
      // ----------------------------------------------------
      this.updateStage(jobRecord, 'script', 25);
      await jobStore.saveJob(jobRecord);

      const script = await scriptService.generateScript(jobId, input, research);
      jobRecord.artifacts.script = script;
      await this.saveArtifact(artifactsDir, 'script.json', script);
      await jobStore.saveJob(jobRecord);

      // ----------------------------------------------------
      // STAGE 3: NARRATION (Audio Timing Anchor)
      // ----------------------------------------------------
      this.updateStage(jobRecord, 'narration', 40);
      await jobStore.saveJob(jobRecord);

      const narration = await narrationService.generateNarration(jobId, script, jobDir);
      jobRecord.artifacts.narration = narration;
      await this.saveArtifact(artifactsDir, 'narration.json', narration);
      await jobStore.saveJob(jobRecord);

      // ----------------------------------------------------
      // STAGE 4: SCENE PLANNING
      // ----------------------------------------------------
      this.updateStage(jobRecord, 'scene_planning', 50);
      await jobStore.saveJob(jobRecord);

      const scenePlan = await scenePlanner.planScenes(jobId, script);
      jobRecord.artifacts.scenePlan = scenePlan;
      await this.saveArtifact(artifactsDir, 'scene-plan.json', scenePlan);
      await jobStore.saveJob(jobRecord);

      // ----------------------------------------------------
      // STAGE 5 & 6: B-ROLL SEARCH & SELECTION
      // ----------------------------------------------------
      this.updateStage(jobRecord, 'broll_search', 60);
      await jobStore.saveJob(jobRecord);

      const selections: SelectedBrollClip[] = [];
      const brollClipsDir = path.join(jobDir, 'broll');
      await fs.mkdir(brollClipsDir, { recursive: true });

      for (let i = 0; i < scenePlan.scenes.length; i++) {
        const scene = scenePlan.scenes[i];
        logger.info(jobId, 'broll_search', `Processing B-roll for scene ${i + 1}/${scenePlan.scenes.length}: ${scene.sceneId}`);

        let candidates: any[] = [];
        let queryUsed = scene.searchQueries[0] || input.topic;

        for (const query of scene.searchQueries) {
          const results = await brollProvider.searchCandidates(jobId, query, scene.estimatedDurationSec);
          if (results.length > 0) {
            candidates = results;
            queryUsed = query;
            break;
          }
        }

        if (!candidates.length) {
          // Fallback to topic search
          candidates = await brollProvider.searchCandidates(jobId, input.topic, scene.estimatedDurationSec);
        }

        const evaluation = brollSelector.selectBestCandidate(candidates, scene, queryUsed);
        const downloadedLocalPath = await brollProvider.downloadClip(jobId, evaluation.candidate, brollClipsDir);

        selections.push({
          sceneId: scene.sceneId,
          searchQueryUsed: queryUsed,
          selectedClip: {
            id: evaluation.candidate.id,
            provider: evaluation.candidate.provider,
            sourceUrl: evaluation.candidate.sourceUrl,
            localPath: downloadedLocalPath,
            originalWidth: evaluation.candidate.width,
            originalHeight: evaluation.candidate.height,
            originalDurationSec: evaluation.candidate.durationSec,
            aspectRatio: evaluation.candidate.aspectRatio,
            score: evaluation.score,
            scoreBreakdown: evaluation.scoreBreakdown,
          },
          candidatesEvaluated: candidates.length,
          reasoning: evaluation.reasoning,
        });
      }

      this.updateStage(jobRecord, 'broll_selection', 70);
      const brollSelectionArtifact: BrollSelectionArtifact = {
        selections,
        cacheHits: 0,
        downloadsCount: selections.length,
        generatedAt: new Date().toISOString(),
      };
      jobRecord.artifacts.brollSelection = brollSelectionArtifact;
      await this.saveArtifact(artifactsDir, 'broll-selection.json', brollSelectionArtifact);
      await jobStore.saveJob(jobRecord);

      // ----------------------------------------------------
      // STAGE 7: RETENTION-ORIENTED TIMELINE EDITING
      // ----------------------------------------------------
      this.updateStage(jobRecord, 'retention_editing', 80);
      await jobStore.saveJob(jobRecord);

      const timeline = timelineBuilder.buildTimeline(
        jobId,
        narration,
        scenePlan,
        brollSelectionArtifact,
        {
          width: resolution.width,
          height: resolution.height,
          fps: targetFps,
        }
      );
      jobRecord.artifacts.timeline = timeline;
      await this.saveArtifact(artifactsDir, 'timeline.json', timeline);
      await jobStore.saveJob(jobRecord);

      // ----------------------------------------------------
      // STAGE 8: FFMPEG RENDERING
      // ----------------------------------------------------
      this.updateStage(jobRecord, 'ffmpeg_render', 90);
      await jobStore.saveJob(jobRecord);

      const finalVideoPath = path.join(jobDir, 'final_output.mp4');
      const renderReport = await renderer.renderVideo(jobId, timeline, finalVideoPath);
      jobRecord.artifacts.renderReport = renderReport;
      await this.saveArtifact(artifactsDir, 'render-report.json', renderReport);
      await jobStore.saveJob(jobRecord);

      // ----------------------------------------------------
      // STAGE 9: FFPROBE VALIDATION
      // ----------------------------------------------------
      this.updateStage(jobRecord, 'ffprobe_validation', 95);
      await jobStore.saveJob(jobRecord);

      const validation = await validator.validateOutput(jobId, finalVideoPath, {
        width: resolution.width,
        height: resolution.height,
        durationSec: timeline.totalDurationSec,
        fps: targetFps,
      });
      jobRecord.artifacts.validation = validation;
      await this.saveArtifact(artifactsDir, 'validation.json', validation);

      if (!validation.passed) {
        throw new Error(`FFprobe validation failed: ${validation.errors.join(', ')}`);
      }

      // ----------------------------------------------------
      // STAGE 10: COMPLETED
      // ----------------------------------------------------
      jobRecord.currentStage = 'completed';
      jobRecord.status = 'completed';
      jobRecord.progress = 100;
      jobRecord.completedAt = new Date().toISOString();
      jobRecord.finalVideoPath = finalVideoPath;
      jobRecord.finalVideoUrl = `/api/pipeline/jobs/${jobId}/video`;

      await jobStore.saveJob(jobRecord);
      logger.info(jobId, 'completed', `Pipeline completed successfully! Final video ready at ${finalVideoPath}`);
      return jobRecord;
    } catch (error: any) {
      jobRecord.status = 'failed';
      jobRecord.error = {
        stage: jobRecord.currentStage,
        message: error.message || 'Unknown pipeline failure',
        details: error.stack,
      };
      jobRecord.completedAt = new Date().toISOString();
      await jobStore.saveJob(jobRecord);
      logger.error(jobId, jobRecord.currentStage, `Pipeline failed: ${error.message}`, error);
      throw error;
    } finally {
      unsubscribeLogger();
    }
  }

  private updateStage(job: JobRecord, stage: PipelineStage, progress: number) {
    job.currentStage = stage;
    job.progress = progress;
  }

  private async saveArtifact(artifactsDir: string, filename: string, data: any) {
    const filePath = path.join(artifactsDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

export const pipelineOrchestrator = new PipelineOrchestrator();
