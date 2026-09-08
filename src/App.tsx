import React, { useState, useEffect, useRef } from 'react';
import { JobRecord } from './types/pipeline';
import { StageProgressBar } from './components/StageProgressBar';
import { ArtifactInspector } from './components/ArtifactInspector';
import { LogViewer } from './components/LogViewer';
import { VideoPlayerPanel } from './components/VideoPlayerPanel';
import { Sparkles, Video, Settings2, RefreshCw, Layers, History, Play } from 'lucide-react';

const SUGGESTED_TOPICS = [
  'How black holes destroy stars',
  'Why the deep ocean remains unexplored',
  'How supernovas create gold in space',
  'The mystery of the Fermi paradox',
];

export default function App() {
  const [topic, setTopic] = useState('How black holes destroy stars');
  const [desiredDurationSec, setDesiredDurationSec] = useState(18);
  const [style, setStyle] = useState('educational');
  const [resolutionProfile, setResolutionProfile] = useState<'1080x1920' | '720x1280' | '540x960'>('1080x1920');

  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [jobList, setJobList] = useState<JobRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [health, setHealth] = useState<{ ffmpegAvailable: boolean; hasGeminiKey: boolean; hasPexelsKey: boolean } | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch health check & jobs on mount
  useEffect(() => {
    fetchHealth();
    fetchJobs();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.error('Health check failed:', err);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/pipeline/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobList(data.jobs || []);
        if (data.jobs?.length && !currentJob) {
          setCurrentJob(data.jobs[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load jobs:', err);
    }
  };

  // Poll active job while running
  useEffect(() => {
    if (!currentJob || (currentJob.status !== 'running' && currentJob.status !== 'idle')) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/pipeline/jobs/${currentJob.jobId}`);
        if (res.ok) {
          const updated: JobRecord = await res.json();
          setCurrentJob(updated);
          if (updated.status === 'completed' || updated.status === 'failed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            fetchJobs();
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1500);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [currentJob?.jobId, currentJob?.status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/pipeline/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          desiredDurationSec,
          style,
          resolutionProfile,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start generation');
      }

      const { jobId } = await res.json();

      // Immediately set placeholder job record
      const newJobRecord: JobRecord = {
        jobId,
        input: {
          topic: topic.trim(),
          desiredDurationSec,
          style,
          resolutionProfile,
        },
        currentStage: 'queued',
        status: 'running',
        progress: 0,
        startedAt: new Date().toISOString(),
        artifacts: {},
        logs: [{
          timestamp: new Date().toISOString(),
          stage: 'queued',
          level: 'info',
          message: `Generation started for "${topic}"`,
        }],
      };

      setCurrentJob(newJobRecord);
      setJobList(prev => [newJobRecord, ...prev]);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/pipeline/jobs/${jobId}`);
      if (res.ok) {
        const job = await res.json();
        setCurrentJob(job);
      }
    } catch (err) {
      console.error('Failed to select job:', err);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-sans antialiased">
      {/* Top Navigation */}
      <header className="border-b border-stone-800 bg-stone-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-stone-100 flex items-center gap-2">
                Lean AI Video Generator
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-amber-950/60 border border-amber-700/50 text-amber-400 rounded-full">
                  V1 Core
                </span>
              </h1>
              <p className="text-[11px] text-stone-400">
                Autonomous vertical MP4 video pipeline with FFmpeg & FFprobe validation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-900 border border-stone-800 rounded-md text-stone-300">
              <span className={`w-2 h-2 rounded-full ${health?.hasGeminiKey ? 'bg-emerald-400' : 'bg-stone-500'}`} />
              Gemini
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-900 border border-stone-800 rounded-md text-stone-300">
              <span className={`w-2 h-2 rounded-full ${health?.hasPexelsKey ? 'bg-emerald-400' : 'bg-stone-500'}`} />
              Pexels
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-900 border border-stone-800 rounded-md text-stone-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              FFmpeg 9:16
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Generator Input Section */}
        <section className="bg-stone-900 border border-stone-800 rounded-xl p-5 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="topic-input" className="block text-xs font-semibold uppercase tracking-wider text-stone-300 mb-2">
                Video Topic
              </label>
              <div className="flex gap-2">
                <input
                  id="topic-input"
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. How black holes destroy stars..."
                  className="flex-1 px-4 py-2.5 bg-stone-950 border border-stone-700/80 rounded-lg text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition-colors"
                  required
                />
                <button
                  type="submit"
                  disabled={isSubmitting || currentJob?.status === 'running'}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 shrink-0 shadow-md"
                >
                  <Sparkles className="w-4 h-4" />
                  {currentJob?.status === 'running' ? 'Pipeline Running...' : 'Generate Video'}
                </button>
              </div>
            </div>

            {/* Suggestions */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-stone-500">Try topic:</span>
              {SUGGESTED_TOPICS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopic(t)}
                  className="text-xs px-2.5 py-1 bg-stone-950/70 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border border-stone-800 rounded-md transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Pipeline Controls / Specs */}
            <div className="pt-2 border-t border-stone-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-stone-400 mb-1 font-medium">Target Duration</label>
                <select
                  value={desiredDurationSec}
                  onChange={e => setDesiredDurationSec(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                >
                  <option value={15}>15 seconds (~40 words)</option>
                  <option value={18}>18 seconds (~48 words)</option>
                  <option value={24}>24 seconds (~65 words)</option>
                  <option value={30}>30 seconds (~80 words)</option>
                </select>
              </div>

              <div>
                <label className="block text-stone-400 mb-1 font-medium">Tone & Style</label>
                <select
                  value={style}
                  onChange={e => setStyle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="educational">Educational & Fast-Paced</option>
                  <option value="dramatic">Dramatic & Mystery Hook</option>
                  <option value="curious">Mind-Blowing Curiosities</option>
                </select>
              </div>

              <div>
                <label className="block text-stone-400 mb-1 font-medium">Canvas Aspect Profile</label>
                <select
                  value={resolutionProfile}
                  onChange={e => setResolutionProfile(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-stone-950 border border-stone-800 rounded text-stone-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="1080x1920">1080x1920 (9:16 Full HD)</option>
                  <option value="720x1280">720x1280 (9:16 HD)</option>
                  <option value="540x960">540x960 (9:16 Fast Render)</option>
                </select>
              </div>
            </div>
          </form>
        </section>

        {/* Stage Progress Bar */}
        {currentJob && (
          <StageProgressBar
            currentStage={currentJob.currentStage}
            progress={currentJob.progress}
            status={currentJob.status}
            error={currentJob.error}
          />
        )}

        {/* Working Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Video Player Panel */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <VideoPlayerPanel
              videoUrl={currentJob?.finalVideoUrl}
              jobId={currentJob?.jobId}
              validation={currentJob?.artifacts.validation}
              topic={currentJob?.input.topic}
              status={currentJob?.status || 'idle'}
            />

            {/* Job History Drawer */}
            <div className="w-full bg-stone-900 border border-stone-800 rounded-xl p-4 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-300">
                  <History className="w-4 h-4 text-amber-400" />
                  <span>Pipeline Job History ({jobList.length})</span>
                </div>
                <button
                  onClick={fetchJobs}
                  className="text-stone-500 hover:text-stone-300 p-1 rounded transition-colors"
                  title="Refresh jobs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {jobList.length === 0 ? (
                  <p className="text-xs text-stone-600">No jobs generated yet.</p>
                ) : (
                  jobList.map(job => (
                    <button
                      key={job.jobId}
                      onClick={() => handleSelectJob(job.jobId)}
                      className={`w-full text-left p-2 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                        currentJob?.jobId === job.jobId
                          ? 'border-amber-500/60 bg-amber-950/20 text-stone-200'
                          : 'border-stone-800 bg-stone-950 hover:bg-stone-800/50 text-stone-400'
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="font-medium truncate">{job.input.topic}</div>
                        <div className="text-[10px] text-stone-500">{new Date(job.startedAt).toLocaleTimeString()}</div>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold font-mono ${
                          job.status === 'completed'
                            ? 'bg-emerald-950 text-emerald-400'
                            : job.status === 'failed'
                            ? 'bg-rose-950 text-rose-400'
                            : 'bg-amber-950 text-amber-400 animate-pulse'
                        }`}
                      >
                        {job.status}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Artifacts & Logs */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <ArtifactInspector
              artifacts={currentJob?.artifacts || {}}
              jobId={currentJob?.jobId || ''}
            />

            <LogViewer
              logs={currentJob?.logs || []}
              jobId={currentJob?.jobId || ''}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
