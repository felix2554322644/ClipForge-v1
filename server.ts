import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { VideoPipelineOrchestrator } from './src/pipeline/orchestrator';
import { CONFIG } from './src/config/index';

const app = express();
const PORT = 3000;

app.use(express.json());

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    piperInstalled: fs.existsSync(CONFIG.PIPER_PATH),
    modelInstalled: fs.existsSync(CONFIG.PIPER_MODEL_PATH),
    allowFallbacks: CONFIG.ALLOW_FALLBACKS,
  });
});

app.get('/api/jobs', (req, res) => {
  const artifactsDir = CONFIG.OUTPUT_DIR;
  if (!fs.existsSync(artifactsDir)) {
    return res.json([]);
  }

  const jobs = [];
  const entries = fs.readdirSync(artifactsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const jobPath = path.join(artifactsDir, entry.name, 'job.json');
      if (fs.existsSync(jobPath)) {
        try {
          jobs.push(JSON.parse(fs.readFileSync(jobPath, 'utf-8')));
        } catch {
          // ignore
        }
      }
    }
  }

  res.json(jobs.reverse());
});

app.post('/api/jobs', async (req, res) => {
  const topic = req.body.topic || 'The Mystery of Deep Space Fast Radio Bursts';
  const orchestrator = new VideoPipelineOrchestrator();

  // Run asynchronously
  orchestrator.runJob(topic).catch((err) => {
    console.error('Job failed:', err);
  });

  res.json({ status: 'initiated', topic });
});

// Static artifacts serving
app.use('/artifacts', express.static(CONFIG.OUTPUT_DIR));

async function startServer() {
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
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
