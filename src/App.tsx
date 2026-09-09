import React, { useEffect, useState } from 'react';
import { Play, CheckCircle2, AlertCircle, Video, Volume2, Cpu, FileText } from 'lucide-react';

interface HealthStatus {
  status: string;
  piperInstalled: boolean;
  modelInstalled: boolean;
  allowFallbacks: boolean;
}

interface Job {
  id: string;
  topic: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  currentStage: string;
  progressPercent: number;
  outputDirectory: string;
  finalVideoPath?: string;
  startedAt: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [topic, setTopic] = useState('The Mystery of Deep Space Fast Radio Bursts');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) setHealth(await res.json());

      const jobsRes = await fetch('/api/jobs');
      if (jobsRes.ok) setJobs(await jobsRes.json());
    } catch {
      // ignore in offline/preview
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const triggerJob = async () => {
    setIsSubmitting(true);
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      await fetchStatus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 font-sans text-zinc-200">
      <header className="border-b border-zinc-800 pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Video className="w-7 h-7 text-indigo-400" />
            Autonomous AI Video Generator V1
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            GitHub Actions Native Pipeline with Local Piper TTS, Pexels Footage & FFmpeg Composition
          </p>
        </div>

        <div className="flex items-center gap-3 bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800">
          <Cpu className="w-4 h-4 text-zinc-400" />
          <span className="text-xs text-zinc-300">Piper TTS Engine:</span>
          {health?.piperInstalled && health?.modelInstalled ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Ready (ONNX Voice)
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
              <AlertCircle className="w-3.5 h-3.5" /> Running Setup
            </span>
          )}
        </div>
      </header>

      {/* Control Panel */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Pipeline Execution Dispatcher</h2>
        <div className="flex gap-4">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            placeholder="Enter documentary topic..."
          />
          <button
            onClick={triggerJob}
            disabled={isSubmitting}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition"
          >
            <Play className="w-4 h-4" />
            {isSubmitting ? 'Starting...' : 'Run Pipeline'}
          </button>
        </div>
      </section>

      {/* Jobs List */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-400" />
          Generated Jobs & Video Artifacts
        </h2>

        {jobs.length === 0 ? (
          <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-2xl p-12 text-center text-zinc-500">
            No pipeline jobs run yet. Dispatch one above or via GitHub Actions workflow.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-mono text-zinc-400">{job.id}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-medium ${
                        job.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : job.status === 'FAILED'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                      }`}
                    >
                      {job.status} ({job.currentStage})
                    </span>
                  </div>

                  <h3 className="font-medium text-white text-base mb-2">{job.topic}</h3>

                  <div className="w-full bg-zinc-950 rounded-full h-2 mb-4 overflow-hidden border border-zinc-800">
                    <div
                      className="bg-indigo-500 h-full transition-all duration-300"
                      style={{ width: `${job.progressPercent}%` }}
                    />
                  </div>
                </div>

                {job.finalVideoPath && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Render complete</span>
                    <a
                      href={`/artifacts/${job.id}/final-video.mp4`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 px-3 py-1.5 rounded-lg border border-indigo-500/30 flex items-center gap-1.5"
                    >
                      <Video className="w-3.5 h-3.5" /> View Video
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
