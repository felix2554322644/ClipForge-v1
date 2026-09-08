import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { config } from './src/server/config.js';
import { jobStore } from './src/server/jobStore.js';
import { pipelineOrchestrator } from './src/server/orchestrator/PipelineOrchestrator.js';
import { PipelineInput } from './src/types/pipeline.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // -----------------------------------------------------------------
  // API Routes
  // -----------------------------------------------------------------

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      ffmpegAvailable: true,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY || config.geminiApiKey),
      hasPexelsKey: Boolean(process.env.PEXELS_API_KEY || config.pexelsApiKey),
      piperConfigured: Boolean(config.piperPath),
    });
  });

  // Start new video generation job
  app.post('/api/pipeline/generate', async (req, res) => {
    try {
      const { topic, desiredDurationSec, style, language, resolutionProfile } = req.body;

      if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
        return res.status(400).json({ error: 'Topic is required.' });
      }

      const input: PipelineInput = {
        topic: topic.trim(),
        desiredDurationSec: desiredDurationSec ? Number(desiredDurationSec) : 18,
        style: style || 'educational',
        language: language || 'en',
        resolutionProfile: resolutionProfile || '1080x1920',
      };

      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // Execute pipeline asynchronously so client can poll or watch progress
      pipelineOrchestrator.executePipeline(input, jobId).catch((err) => {
        console.error(`Pipeline job ${jobId} failed:`, err);
      });

      res.status(202).json({
        message: 'Pipeline generation started',
        jobId,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List all recent generation jobs
  app.get('/api/pipeline/jobs', async (req, res) => {
    try {
      const jobs = await jobStore.listJobs();
      res.json({ jobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get specific job state, artifacts, and logs
  app.get('/api/pipeline/jobs/:id', async (req, res) => {
    try {
      const job = await jobStore.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Stream/download finished video MP4
  app.get('/api/pipeline/jobs/:id/video', async (req, res) => {
    try {
      const job = await jobStore.getJob(req.params.id);
      if (!job || !job.finalVideoPath) {
        return res.status(404).json({ error: 'Video not found or job not finished' });
      }

      const videoPath = job.finalVideoPath;
      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ error: 'Video file not found on disk' });
      }

      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
          'Content-Disposition': `inline; filename="${job.jobId}.mp4"`,
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download raw artifact JSON
  app.get('/api/pipeline/jobs/:id/artifacts/:name', async (req, res) => {
    try {
      const artifactPath = path.join(config.jobsDir, req.params.id, 'artifacts', req.params.name);
      if (!fs.existsSync(artifactPath)) {
        return res.status(404).json({ error: 'Artifact not found' });
      }
      res.sendFile(artifactPath);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------------
  // Vite Integration
  // -----------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lean AI Video Generator server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
