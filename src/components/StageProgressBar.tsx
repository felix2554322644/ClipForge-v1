import React from 'react';
import { PipelineStage } from '../types/pipeline';
import { CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';

interface StageProgressBarProps {
  currentStage: PipelineStage;
  progress: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
  error?: { stage: string; message: string };
}

const STAGES: { id: PipelineStage; label: string; number: number }[] = [
  { id: 'research', label: 'Research', number: 1 },
  { id: 'script', label: 'Story & Script', number: 2 },
  { id: 'narration', label: 'Voice Audio', number: 3 },
  { id: 'scene_planning', label: 'Scene Plan', number: 4 },
  { id: 'broll_search', label: 'B-Roll Search', number: 5 },
  { id: 'broll_selection', label: 'Clip Scoring', number: 6 },
  { id: 'retention_editing', label: 'Retention Edit', number: 7 },
  { id: 'ffmpeg_render', label: 'FFmpeg Render', number: 8 },
  { id: 'ffprobe_validation', label: 'FFprobe Validate', number: 9 },
];

export const StageProgressBar: React.FC<StageProgressBarProps> = ({
  currentStage,
  progress,
  status,
  error,
}) => {
  const currentStageIndex = STAGES.findIndex(s => s.id === currentStage);

  return (
    <div className="w-full bg-stone-900 border border-stone-800 rounded-xl p-5 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {status === 'running' && <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />}
          {status === 'completed' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {status === 'failed' && <AlertCircle className="w-5 h-5 text-rose-400" />}
          {status === 'idle' && <Clock className="w-5 h-5 text-stone-500" />}

          <div>
            <h3 className="text-sm font-semibold tracking-wide text-stone-200 uppercase">
              Pipeline Stage: <span className="text-amber-400 font-bold">{currentStage.replace('_', ' ')}</span>
            </h3>
            <p className="text-xs text-stone-400">
              {status === 'running' ? `Executing automated generation pipeline (${progress}%)` :
               status === 'completed' ? 'All pipeline stages finished & FFprobe validated' :
               status === 'failed' ? `Failed at stage: ${error?.stage}` : 'Ready to start'}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-lg font-bold font-mono text-amber-400">{progress}%</span>
        </div>
      </div>

      {/* Progress Bar Track */}
      <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden mb-6">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            status === 'failed' ? 'bg-rose-500' :
            status === 'completed' ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'
          }`}
          style={{ width: `${Math.max(5, progress)}%` }}
        />
      </div>

      {/* Stepper Nodes */}
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">
        {STAGES.map((s, idx) => {
          const isDone = status === 'completed' || (currentStageIndex > idx);
          const isCurrent = currentStage === s.id && status === 'running';
          const isFailed = status === 'failed' && currentStage === s.id;

          return (
            <div
              key={s.id}
              className={`flex flex-col items-center text-center p-2 rounded-lg border transition-all ${
                isFailed
                  ? 'border-rose-700/60 bg-rose-950/30 text-rose-300'
                  : isCurrent
                  ? 'border-amber-500/70 bg-amber-950/30 text-amber-200 ring-1 ring-amber-500/40'
                  : isDone
                  ? 'border-emerald-800/40 bg-emerald-950/20 text-emerald-300'
                  : 'border-stone-800 bg-stone-900/50 text-stone-500'
              }`}
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono font-bold mb-1.5">
                {isFailed ? (
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                ) : isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <span className="text-stone-500">{s.number}</span>
                )}
              </div>
              <span className="text-[11px] font-medium leading-tight line-clamp-1">{s.label}</span>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-rose-950/50 border border-rose-800 rounded-lg text-xs text-rose-300">
          <p className="font-semibold mb-1">Execution Error at [{error.stage}]:</p>
          <p className="font-mono text-[11px] break-all">{error.message}</p>
        </div>
      )}
    </div>
  );
};
