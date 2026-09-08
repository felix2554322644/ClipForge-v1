import React, { useState } from 'react';
import { PipelineArtifacts } from '../types/pipeline';
import { FileJson, Copy, Check, Eye } from 'lucide-react';

interface ArtifactInspectorProps {
  artifacts: PipelineArtifacts;
  jobId: string;
}

type ArtifactKey =
  | 'research'
  | 'script'
  | 'narration'
  | 'scenePlan'
  | 'brollSelection'
  | 'timeline'
  | 'renderReport'
  | 'validation';

const ARTIFACT_TABS: { key: ArtifactKey; filename: string; label: string }[] = [
  { key: 'research', filename: 'research.json', label: '1. Research' },
  { key: 'script', filename: 'script.json', label: '2. Script' },
  { key: 'narration', filename: 'narration.json', label: '3. Narration' },
  { key: 'scenePlan', filename: 'scene-plan.json', label: '4. Scene Plan' },
  { key: 'brollSelection', filename: 'broll-selection.json', label: '5. B-Roll Selection' },
  { key: 'timeline', filename: 'timeline.json', label: '6. Timeline' },
  { key: 'renderReport', filename: 'render-report.json', label: '7. Render Report' },
  { key: 'validation', filename: 'validation.json', label: '8. FFprobe Validation' },
];

export const ArtifactInspector: React.FC<ArtifactInspectorProps> = ({ artifacts, jobId }) => {
  const [activeTab, setActiveTab] = useState<ArtifactKey>('research');
  const [copied, setCopied] = useState(false);

  const activeData = artifacts[activeTab];
  const activeTabMeta = ARTIFACT_TABS.find(t => t.key === activeTab);

  const handleCopy = () => {
    if (!activeData) return;
    navigator.clipboard.writeText(JSON.stringify(activeData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full bg-stone-900 border border-stone-800 rounded-xl overflow-hidden shadow-lg">
      <div className="p-4 border-b border-stone-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileJson className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-semibold text-stone-200">Artifact Inspector</h3>
          <span className="text-xs text-stone-500 bg-stone-800 px-2 py-0.5 rounded font-mono">
            {jobId || 'No active job'}
          </span>
        </div>

        {activeData && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
              title="Copy artifact JSON"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
            <a
              href={`/api/pipeline/jobs/${jobId}/artifacts/${activeTabMeta?.filename}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-950/30 border border-amber-800/50 hover:bg-amber-900/40 rounded-lg transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              Raw Endpoint
            </a>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-stone-800 bg-stone-950/40 p-1 gap-1">
        {ARTIFACT_TABS.map(tab => {
          const hasData = Boolean(artifacts[tab.key]);
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isActive
                  ? 'bg-stone-800 text-amber-400 shadow-sm border border-stone-700/60'
                  : hasData
                  ? 'text-stone-300 hover:bg-stone-800/60 hover:text-stone-100'
                  : 'text-stone-600 cursor-not-allowed opacity-60'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${hasData ? 'bg-emerald-400' : 'bg-stone-600'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="p-4">
        {activeData ? (
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-stone-400 font-mono">
              <span>artifacts/{activeTabMeta?.filename}</span>
              <span>Updated: {activeData.generatedAt || activeData.renderedAt || activeData.validatedAt || 'N/A'}</span>
            </div>
            <div className="max-h-[340px] overflow-y-auto bg-stone-950 p-3.5 rounded-lg border border-stone-800/80 font-mono text-xs text-stone-300 leading-relaxed scrollbar-thin">
              <pre>{JSON.stringify(activeData, null, 2)}</pre>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-stone-500 text-xs">
            Artifact not generated yet for stage: <span className="text-stone-400 font-medium">{activeTab}</span>.
            <br />
            It will populate automatically once this pipeline stage completes.
          </div>
        )}
      </div>
    </div>
  );
};
