import React from 'react';
import { CloudUpload, Pause, Play, X, FastForward } from 'lucide-react';
import {
  formatBytes,
  getUploadStageInfo,
  type ClipItem,
  type SyncSpeedProfileId,
} from '../utils/uploadEngine.ts';

interface UploadQueuePanelProps {
  clips: ClipItem[];
  speedProfile: SyncSpeedProfileId;
  onTogglePauseUpload: (id: string) => void;
  onCompleteUploadNow: (id: string) => void;
  onCancelUpload: (id: string, title?: string) => void;
}

export const UploadQueuePanel: React.FC<UploadQueuePanelProps> = ({
  clips,
  speedProfile,
  onTogglePauseUpload,
  onCompleteUploadNow,
  onCancelUpload,
}) => {
  const activeUploads = clips.filter(
    (c) => c.status === 'uploading' || c.status === 'paused' || c.status === 'failed'
  );

  if (activeUploads.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Uploading to Cloud"
      data-testid="upload-queue-panel"
      className="bg-stone-900 text-stone-100 rounded-2xl p-5"
    >
      <div className="flex items-center justify-between gap-4 pb-3 mb-3 border-b border-stone-800">
        <div className="flex items-center gap-2">
          <CloudUpload className="w-4 h-4 text-stone-300 shrink-0" />
          <h2 className="text-sm font-semibold text-white">
            Uploading to cloud ({activeUploads.length})
          </h2>
        </div>
      </div>

      <div className="divide-y divide-stone-800">
        {activeUploads.map((item) => {
          const stage = getUploadStageInfo(item, speedProfile);
          const isPaused = item.status === 'paused';

          return (
            <div key={item.id} className="py-3 first:pt-0 last:pb-0 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-white truncate max-w-full">
                      {item.title}
                    </span>
                    <span className="text-xs text-stone-400 font-mono tabular-nums shrink-0">
                      {formatBytes(item.uploadedBytes)} / {formatBytes(item.sizeBytes)}
                    </span>
                  </div>
                  <div className="text-xs text-stone-400 font-mono tabular-nums mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>{stage.stageName}</span>
                    <span>·</span>
                    <span>{stage.etaSeconds.toFixed(1)}s left</span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                  <span className="font-mono text-sm font-semibold text-stone-200 tabular-nums mr-1">
                    {item.progress}%
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onTogglePauseUpload(item.id)}
                      aria-label={
                        isPaused ? `Resume upload for ${item.title}` : `Pause upload for ${item.title}`
                      }
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-stone-200 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Resume</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3.5 h-3.5 text-amber-400" />
                          <span>Pause</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onCompleteUploadNow(item.id)}
                      aria-label={`Finish upload for ${item.title}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-stone-200 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <FastForward className="w-3.5 h-3.5 text-stone-300" />
                      <span>Finish</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onCancelUpload(item.id, item.title)}
                      aria-label={`Cancel upload for ${item.title}`}
                      className="p-1.5 text-stone-400 hover:text-red-400 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-100 ease-linear rounded-full ${
                    isPaused ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
