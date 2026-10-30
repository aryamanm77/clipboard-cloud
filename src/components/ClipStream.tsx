import React, { useState } from 'react';
import {
  Search,
  Copy,
  Check,
  Bookmark,
  Trash2,
  Eye,
  Download,
  LayoutGrid,
  List,
  Image as ImageIcon,
  FolderArchive,
  FileText,
  CloudUpload,
  CheckCircle2,
  PauseCircle,
  X,
} from 'lucide-react';
import {
  formatBytes,
  getUploadStageInfo,
  isPdfClip,
  isWordClip,
  type ClipItem,
  type FilterTab,
  type SyncSpeedProfileId,
} from '../utils/uploadEngine.ts';

interface ClipStreamProps {
  clips: ClipItem[];
  filteredClips: ClipItem[];
  activeTab: FilterTab;
  onSelectTab: (tab: FilterTab) => void;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  speedProfile: SyncSpeedProfileId;
  copiedClipId: string | null;
  onCopyClip: (clip: ClipItem) => void;
  onDownloadClip: (clip: ClipItem) => void;
  onTogglePin: (id: string) => void;
  onDeleteClip: (id: string) => void;
  onInspectClip: (clip: ClipItem) => void;
  onClearSynced: () => void;
  onFocusComposer: () => void;
  selectedIds: string[];
  onToggleSelectClip: (id: string) => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onCopySelected: () => void;
  onDeleteSelected: () => void;
  batchCopied: boolean;
}

export const ClipStream: React.FC<ClipStreamProps> = ({
  clips,
  filteredClips,
  activeTab,
  onSelectTab,
  searchQuery,
  onChangeSearchQuery,
  speedProfile,
  copiedClipId,
  onCopyClip,
  onDownloadClip,
  onTogglePin,
  onDeleteClip,
  onInspectClip,
  onClearSynced,
  onFocusComposer,
  selectedIds,
  onToggleSelectClip,
  onSelectAllVisible,
  onClearSelection,
  onCopySelected,
  onDeleteSelected,
  batchCopied,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const filterButtons: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'text', label: 'Text' },
    { id: 'image', label: 'Images' },
    { id: 'file', label: 'Files' },
    { id: 'pinned', label: 'Pinned' },
    { id: 'uploading', label: 'Uploading' },
  ];

  const allVisibleSelected =
    filteredClips.length > 0 && filteredClips.every((c) => selectedIds.includes(c.id));
  const selectedCount = selectedIds.length;

  const formatRelativeTime = (iso: string) => {
    const diffSec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  };

  const getCategoryLabel = (clip: ClipItem) => {
    if (isPdfClip(clip)) return 'PDF';
    if (isWordClip(clip)) return clip.title.toLowerCase().endsWith('.doc') ? 'DOC' : 'DOCX';
    switch (clip.category) {
      case 'code':
        return 'Code';
      case 'image':
        return 'Image';
      case 'file':
        return 'File';
      default:
        return 'Text';
    }
  };

  return (
    <section aria-label="Saved Clips" className="space-y-4">
      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {filteredClips.length > 0 && (
            <label className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs font-medium text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={onSelectAllVisible}
                aria-label="Select all clips"
                className="w-3.5 h-3.5 rounded border-stone-300 text-stone-900 focus:ring-stone-900 accent-stone-900 cursor-pointer"
              />
              <span>Select All</span>
            </label>
          )}

          <div
            role="tablist"
            aria-label="Filter Clips"
            className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 rounded-xl"
          >
            {filterButtons.map((btn) => {
              const active = activeTab === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectTab(btn.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search clips"
              value={searchQuery}
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              placeholder="Search clips..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-stone-50 border border-stone-200/80 rounded-xl text-stone-900 placeholder:text-stone-400 focus:bg-white focus:border-stone-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onChangeSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="View Mode"
            className="flex items-center p-0.5 bg-stone-100 rounded-xl border border-stone-200/80"
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-label="List view"
              aria-pressed={viewMode === 'table'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          {clips.some((c) => !c.pinned && c.status === 'synced') && (
            <button
              type="button"
              onClick={onClearSynced}
              className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-red-700 bg-stone-50 hover:bg-red-50 border border-stone-200/80 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Batch Operations Action Bar */}
      {selectedCount > 0 && (
        <div
          role="region"
          aria-label="Batch Actions"
          className="bg-stone-900 text-stone-100 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold font-mono tabular-nums">
              {selectedCount} {selectedCount === 1 ? 'clip' : 'clips'} selected
            </span>
            <button
              type="button"
              onClick={onSelectAllVisible}
              className="text-xs text-stone-300 hover:text-white underline underline-offset-2 cursor-pointer"
            >
              {allVisibleSelected ? 'Deselect visible' : 'Select all visible'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCopySelected}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                batchCopied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-stone-800 text-stone-100 hover:bg-stone-700 border border-stone-700'
              }`}
            >
              {batchCopied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied Selected</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Selected</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onDeleteSelected}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>

            <button
              type="button"
              onClick={onClearSelection}
              aria-label="Clear selection"
              className="p-1.5 text-stone-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredClips.length === 0 ? (
        <div className="bg-white border border-stone-200/90 rounded-2xl p-12 text-center max-w-md mx-auto my-4">
          <CloudUpload className="w-7 h-7 text-stone-400 mx-auto mb-2.5" />
          <h3 className="text-sm font-semibold text-stone-900">No clips found</h3>
          <p className="text-xs text-stone-500 mt-1">
            {searchQuery
              ? `Nothing matched "${searchQuery}".`
              : 'Name your clip or file above and click Upload to Cloud.'}
          </p>
          <div className="mt-4">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onChangeSearchQuery('')}
                className="px-4 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                Clear Search
              </button>
            ) : (
              <button
                type="button"
                onClick={onFocusComposer}
                className="px-4 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                Add Clip
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* Compact List View */
        <div className="bg-white border border-stone-200/90 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-medium text-stone-500">
                  <th className="py-2.5 pl-4 pr-2 w-9">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={onSelectAllVisible}
                      aria-label="Select all visible rows"
                      className="w-3.5 h-3.5 rounded border-stone-300 text-stone-900 focus:ring-stone-900 accent-stone-900 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-3">Title</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Size</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs">
                {filteredClips.map((clip) => {
                  const stage = getUploadStageInfo(clip, speedProfile);
                  const isCopied = copiedClipId === clip.id;
                  const isSelected = selectedIds.includes(clip.id);
                  return (
                    <tr
                      key={clip.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-stone-100/90' : 'hover:bg-stone-50/80'
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelectClip(clip.id)}
                          aria-label={`Select ${clip.title}`}
                          className="w-3.5 h-3.5 rounded border-stone-300 text-stone-900 focus:ring-stone-900 accent-stone-900 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 font-medium text-stone-900 max-w-xs truncate">
                        <button
                          type="button"
                          onClick={() => onInspectClip(clip)}
                          className="hover:underline text-left truncate block w-full cursor-pointer font-semibold"
                        >
                          {clip.title}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-stone-500 whitespace-nowrap">
                        {getCategoryLabel(clip)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-stone-500 whitespace-nowrap">
                        {formatBytes(clip.sizeBytes)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {clip.status === 'synced' ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Saved</span>
                          </span>
                        ) : (
                          <div className="space-y-1 min-w-32">
                            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-stone-700">
                              <span>{stage.stageName}</span>
                              <span>{clip.progress}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-600 rounded-full transition-[width] duration-100 ease-linear"
                                style={{
                                  width: `${Math.max(0, Math.min(100, clip.progress))}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onCopyClip(clip)}
                            aria-label={`Copy ${clip.title}`}
                            className="px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-200/70 rounded-lg transition-colors cursor-pointer"
                          >
                            {isCopied ? 'Copied' : 'Copy'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDownloadClip(clip)}
                            aria-label={`Download ${clip.title}`}
                            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-lg cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onInspectClip(clip)}
                            aria-label={`View ${clip.title}`}
                            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-lg cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteClip(clip.id)}
                            aria-label={`Delete ${clip.title}`}
                            className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Soft Utilitarian Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredClips.map((clip) => {
            const stage = getUploadStageInfo(clip, speedProfile);
            const isUploading = clip.status === 'uploading' || clip.status === 'paused';
            const isCopied = copiedClipId === clip.id;
            const isSelected = selectedIds.includes(clip.id);
            const isPdf = isPdfClip(clip);
            const isWord = isWordClip(clip);

            return (
              <article
                key={clip.id}
                className={`bg-white border rounded-2xl p-5 flex flex-col justify-between transition-colors ${
                  isSelected
                    ? 'border-stone-900 ring-1 ring-stone-900/15 bg-stone-50/30'
                    : 'border-stone-200/90 hover:border-stone-300'
                }`}
              >
                <div>
                  {/* Quiet 1-line unboxed metadata + selection checkbox */}
                  <div className="flex items-center justify-between gap-2 text-xs text-stone-500 mb-2">
                    <div className="flex items-center gap-2 font-mono tabular-nums truncate">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectClip(clip.id)}
                        aria-label={`Select ${clip.title}`}
                        className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900 accent-stone-900 cursor-pointer shrink-0"
                      />
                      <span>{getCategoryLabel(clip)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatBytes(clip.sizeBytes)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatRelativeTime(clip.createdAt)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {clip.status === 'synced' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Saved</span>
                        </span>
                      ) : clip.status === 'paused' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 font-mono tabular-nums">
                          <PauseCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Paused ({clip.progress}%)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-800 font-mono tabular-nums">
                          <CloudUpload className="w-3.5 h-3.5 text-stone-700 shrink-0" />
                          <span>Uploading {clip.progress}%</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-semibold text-stone-900 leading-snug truncate mb-3">
                    <button
                      type="button"
                      onClick={() => onInspectClip(clip)}
                      className="hover:text-stone-600 text-left truncate block max-w-full cursor-pointer"
                    >
                      {clip.title}
                    </button>
                  </h3>

                  {/* Active Upload Bar */}
                  {isUploading && (
                    <div className="mb-3.5 py-2.5 px-3 bg-stone-50 border border-stone-200/80 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                        <span className="text-stone-700">{stage.stageName}</span>
                        <span className="text-stone-600">
                          {stage.etaSeconds.toFixed(1)}s left
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-[width] duration-100 ease-linear"
                          style={{
                            width: `${Math.max(0, Math.min(100, clip.progress))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Content Preview */}
                  {clip.category === 'image' ? (
                    <div
                      onClick={() => onInspectClip(clip)}
                      className="relative h-44 bg-stone-100 rounded-xl overflow-hidden border border-stone-200/80 cursor-pointer"
                    >
                      {!failedImages[clip.id] ? (
                        <img
                          src={clip.fileDataUrl || clip.content}
                          alt={clip.title}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [clip.id]: true }))
                          }
                          className={`w-full h-full object-cover transition-opacity duration-200 ${
                            isUploading ? 'opacity-75' : 'opacity-100'
                          }`}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-stone-100 text-stone-500 p-4">
                          <ImageIcon className="w-6 h-6 mb-1 text-stone-400" />
                          <span className="text-xs font-medium text-stone-700">{clip.title}</span>
                        </div>
                      )}
                    </div>
                  ) : clip.category === 'code' ? (
                    <div
                      onClick={() => onInspectClip(clip)}
                      className="bg-stone-900 text-stone-100 rounded-xl p-3.5 font-mono text-xs overflow-x-auto max-h-40 cursor-pointer"
                    >
                      <pre className="leading-relaxed whitespace-pre-wrap break-words">
                        <code>{clip.content.slice(0, 320)}</code>
                      </pre>
                    </div>
                  ) : clip.category === 'file' ? (
                    <div
                      onClick={() => onInspectClip(clip)}
                      className="bg-stone-50 border border-stone-200/80 rounded-xl p-3.5 cursor-pointer flex items-start gap-3"
                    >
                      {isPdf ? (
                        <span className="px-2 py-1 text-[10px] font-mono font-bold bg-stone-900 text-white rounded-lg shrink-0 mt-0.5">
                          PDF
                        </span>
                      ) : isWord ? (
                        <span className="px-2 py-1 text-[10px] font-mono font-bold bg-blue-700 text-white rounded-lg shrink-0 mt-0.5">
                          {clip.title.toLowerCase().endsWith('.doc') ? 'DOC' : 'DOCX'}
                        </span>
                      ) : (
                        <FolderArchive className="w-5 h-5 text-stone-600 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-stone-800 truncate">
                          {clip.title}
                        </p>
                        <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-2">
                          {clip.extractedText
                            ? clip.extractedText
                            : isPdf
                              ? 'Click to preview PDF or download below'
                              : isWord
                                ? 'Click to preview Word document or download below'
                                : clip.content}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => onInspectClip(clip)}
                      className="bg-stone-50 border border-stone-200/80 rounded-xl p-3.5 cursor-pointer"
                    >
                      <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-line line-clamp-4">
                        {clip.content}
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="pt-3.5 mt-4 border-t border-stone-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-stone-400 font-mono tabular-nums truncate">
                    Keep: {clip.ttlLabel}
                  </span>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onCopyClip(clip)}
                      aria-label={`Copy ${clip.title}`}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                        isCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-stone-100 text-stone-800 hover:bg-stone-200/80'
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onDownloadClip(clip)}
                      aria-label={`Download ${clip.title}`}
                      className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onInspectClip(clip)}
                      aria-label={`View ${clip.title}`}
                      className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onTogglePin(clip.id)}
                      aria-label={clip.pinned ? `Unpin ${clip.title}` : `Pin ${clip.title}`}
                      aria-pressed={clip.pinned}
                      className={`p-2 rounded-xl transition-colors cursor-pointer ${
                        clip.pinned
                          ? 'text-stone-900 bg-stone-200/80'
                          : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <Bookmark className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteClip(clip.id)}
                      aria-label={`Delete ${clip.title}`}
                      className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
