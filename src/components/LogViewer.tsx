import React, { useRef, useEffect, useState } from 'react';
import { LogEntry } from '../types/pipeline';
import { Terminal, ArrowDown, Trash2 } from 'lucide-react';

interface LogViewerProps {
  logs: LogEntry[];
  jobId: string;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, jobId }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = filter
    ? logs.filter(
        l =>
          l.message.toLowerCase().includes(filter.toLowerCase()) ||
          l.stage.toLowerCase().includes(filter.toLowerCase())
      )
    : logs;

  return (
    <div className="w-full bg-stone-900 border border-stone-800 rounded-xl overflow-hidden shadow-lg flex flex-col h-[400px]">
      {/* Header */}
      <div className="p-3.5 border-b border-stone-800 flex items-center justify-between bg-stone-950/60">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-semibold text-stone-200 tracking-wide uppercase">Pipeline Execution Logs</h3>
          <span className="text-[11px] font-mono text-stone-400 bg-stone-800 px-1.5 py-0.5 rounded">
            {filteredLogs.length} events
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter logs..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="px-2.5 py-1 text-xs bg-stone-900 border border-stone-700/60 rounded text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500 w-32 md:w-44"
          />
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded text-xs transition-colors ${
              autoScroll ? 'bg-amber-950 text-amber-400 border border-amber-800/50' : 'text-stone-400 hover:bg-stone-800'
            }`}
            title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log Feed */}
      <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto bg-stone-950 font-mono text-[11px] leading-relaxed space-y-1">
        {filteredLogs.length === 0 ? (
          <div className="text-stone-600 text-center py-10">No log entries recorded yet.</div>
        ) : (
          filteredLogs.map((log, idx) => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const isError = log.level === 'error';
            const isWarn = log.level === 'warn';

            return (
              <div
                key={idx}
                className={`flex items-start gap-2 py-0.5 px-1 rounded ${
                  isError ? 'bg-rose-950/40 text-rose-300' : isWarn ? 'bg-amber-950/30 text-amber-300' : 'text-stone-300'
                }`}
              >
                <span className="text-stone-500 shrink-0 select-none">[{time}]</span>
                <span className="px-1.5 py-0.2 bg-stone-800 text-stone-300 text-[10px] rounded uppercase font-semibold shrink-0">
                  {log.stage}
                </span>
                <span className="break-all flex-1">{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
