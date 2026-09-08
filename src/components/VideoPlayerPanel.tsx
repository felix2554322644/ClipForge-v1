import React from 'react';
import { ValidationArtifact } from '../types/pipeline';
import { Film, Download, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface VideoPlayerPanelProps {
  videoUrl?: string;
  jobId?: string;
  validation?: ValidationArtifact;
  topic?: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
}

export const VideoPlayerPanel: React.FC<VideoPlayerPanelProps> = ({
  videoUrl,
  jobId,
  validation,
  topic,
  status,
}) => {
  return (
    <div className="w-full bg-stone-900 border border-stone-800 rounded-xl p-5 shadow-lg flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-4 border-b border-stone-800 pb-3">
        <div className="flex items-center gap-2">
          <Film className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-semibold text-stone-200">Vertical Video Output</h3>
        </div>

        {validation?.passed && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 text-xs font-medium rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>FFprobe Validated</span>
          </div>
        )}
      </div>

      {/* 9:16 Video Player Stage */}
      <div className="w-full max-w-[280px] aspect-[9/16] bg-stone-950 rounded-xl border border-stone-800 overflow-hidden relative shadow-2xl flex items-center justify-center">
        {videoUrl && status === 'completed' ? (
          <video
            key={videoUrl}
            controls
            autoPlay
            loop
            playsInline
            className="w-full h-full object-contain"
            src={videoUrl}
          >
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <Film className="w-12 h-12 text-stone-700 mb-3 animate-pulse" />
            <p className="text-xs font-medium text-stone-400">
              {status === 'running'
                ? 'Pipeline is autonomously researching, scripting, voicing, and rendering video...'
                : status === 'failed'
                ? 'Generation stopped due to pipeline error.'
                : 'Enter a topic above to generate a full 9:16 narrated short video.'}
            </p>
          </div>
        )}
      </div>

      {/* Validation & Technical Metadata */}
      {validation && (
        <div className="w-full mt-4 bg-stone-950 p-3.5 rounded-lg border border-stone-800 text-xs space-y-2">
          <div className="flex items-center justify-between text-stone-400 pb-2 border-b border-stone-800/80">
            <span className="font-semibold text-stone-300">FFprobe Media Spec</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${validation.passed ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`}>
              {validation.passed ? 'VALIDATED 9:16' : 'CHECK FAILED'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="text-stone-400">Resolution: <span className="text-stone-200">{validation.metrics.width}x{validation.metrics.height}</span></div>
            <div className="text-stone-400">Duration: <span className="text-stone-200">{validation.metrics.actualDurationSec}s</span></div>
            <div className="text-stone-400">Video Codec: <span className="text-stone-200">{validation.metrics.videoCodec}</span></div>
            <div className="text-stone-400">Audio Codec: <span className="text-stone-200">{validation.metrics.audioCodec}</span></div>
            <div className="text-stone-400">Frame Rate: <span className="text-stone-200">{validation.metrics.fps} fps</span></div>
            <div className="text-stone-400">File Size: <span className="text-stone-200">{(validation.metrics.fileSizeBytes / 1024 / 1024).toFixed(2)} MB</span></div>
          </div>

          {validation.errors.length > 0 && (
            <div className="p-2 bg-rose-950/40 border border-rose-800/60 rounded text-rose-300 text-[11px]">
              {validation.errors.map((e, idx) => (
                <p key={idx}>• {e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Download Action */}
      {videoUrl && status === 'completed' && (
        <div className="w-full mt-4 flex items-center justify-center">
          <a
            href={videoUrl}
            download={`${jobId || 'video'}.mp4`}
            className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md"
          >
            <Download className="w-4 h-4" />
            Download Validated Vertical MP4
          </a>
        </div>
      )}
    </div>
  );
};
