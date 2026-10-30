import React from 'react';
import {
  Layers,
  FileText,
  Image as ImageIcon,
  FolderArchive,
  Bookmark,
  CloudUpload,
  Gauge,
  HardDrive,
  Trash2,
  Download,
  QrCode,
} from 'lucide-react';
import {
  SYNC_SPEED_PROFILES,
  type ClipItem,
  type FilterTab,
  type SyncSpeedProfileId,
  calculateStorageMetrics,
} from '../utils/uploadEngine.ts';

interface SidebarProps {
  clips: ClipItem[];
  activeTab: FilterTab;
  onSelectTab: (tab: FilterTab) => void;
  speedProfile: SyncSpeedProfileId;
  onChangeSpeedProfile: (profile: SyncSpeedProfileId) => void;
  onClearAllClips: () => void;
  isInstalled: boolean;
  onInstallClick: () => void;
  workspaceId: string;
  onOpenQrModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  clips,
  activeTab,
  onSelectTab,
  speedProfile,
  onChangeSpeedProfile,
  onClearAllClips,
  isInstalled,
  onInstallClick,
  workspaceId,
  onOpenQrModal,
}) => {
  const metrics = calculateStorageMetrics(clips);

  const counts = {
    all: clips.length,
    text: clips.filter((c) => c.category === 'text' || c.category === 'code').length,
    image: clips.filter((c) => c.category === 'image').length,
    file: clips.filter((c) => c.category === 'file').length,
    pinned: clips.filter((c) => c.pinned).length,
    uploading: metrics.activeUploadCount,
  };

  const navCollections: {
    id: FilterTab;
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'all', label: 'All', count: counts.all, icon: Layers },
    { id: 'text', label: 'Text', count: counts.text, icon: FileText },
    { id: 'image', label: 'Images', count: counts.image, icon: ImageIcon },
    { id: 'file', label: 'Files', count: counts.file, icon: FolderArchive },
    { id: 'pinned', label: 'Pinned', count: counts.pinned, icon: Bookmark },
    { id: 'uploading', label: 'Uploading', count: counts.uploading, icon: CloudUpload },
  ];

  return (
    <aside
      aria-label="Sidebar"
      className="w-full lg:w-64 shrink-0 bg-stone-100 border-t lg:border-t-0 lg:border-r border-stone-200 flex flex-col justify-between"
    >
      <div className="p-5 space-y-6">
        {/* Collections */}
        <div>
          <h2 className="px-2.5 text-xs font-medium text-stone-500 mb-2">Clips</h2>
          <nav aria-label="Clip Categories" className="space-y-1">
            {navCollections.map((item) => {
              const Icon = item.icon;
              const isSelected = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-700 hover:bg-stone-200/70 hover:text-stone-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? 'text-stone-300' : 'text-stone-400'
                      }`}
                    />
                    <span className="truncate whitespace-nowrap">{item.label}</span>
                  </span>
                  <span
                    className={`font-mono text-xs tabular-nums ml-2 ${
                      isSelected ? 'text-stone-300' : 'text-stone-500'
                    }`}
                  >
                    {item.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Cloud Upload Time Selector */}
        <div className="pt-5 border-t border-stone-200">
          <div className="flex items-center gap-1.5 px-2 text-xs font-medium text-stone-500 mb-2.5">
            <Gauge className="w-3.5 h-3.5 text-stone-400" />
            <span>Upload Speed</span>
          </div>
          <div className="space-y-1.5" role="radiogroup" aria-label="Upload Speed">
            {(Object.keys(SYNC_SPEED_PROFILES) as SyncSpeedProfileId[]).map((key) => {
              const profile = SYNC_SPEED_PROFILES[key];
              const active = speedProfile === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChangeSpeedProfile(profile.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                    active
                      ? 'border-stone-900 bg-white text-stone-900 font-semibold shadow-2xs'
                      : 'border-stone-200/80 bg-stone-50/60 text-stone-600 hover:bg-white'
                  }`}
                >
                  <span className="whitespace-nowrap">{profile.label}</span>
                  <span className="font-mono text-[11px] text-stone-400 tabular-nums">
                    {profile.nominalSpeedKbps} KB/s
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Workspace QR Sync Card */}
        <div className="pt-5 border-t border-stone-200 space-y-2">
          <div className="flex items-center justify-between px-2 text-xs">
            <span className="font-medium text-stone-500">Workspace ID</span>
            <span className="font-mono text-[11px] text-stone-700 truncate max-w-[120px]">
              {workspaceId}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenQrModal}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-stone-900 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
          >
            <QrCode className="w-3.5 h-3.5 text-stone-700" />
            <span>Mobile QR Sync</span>
          </button>
        </div>
      </div>

      {/* Storage & Actions Footer */}
      <div className="p-5 border-t border-stone-200 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-stone-600">
            <HardDrive className="w-3.5 h-3.5 text-stone-400" />
            <span>Cloud Storage</span>
          </span>
          <span className="font-mono text-stone-500 tabular-nums">
            {metrics.totalFormatted} / 50 MB
          </span>
        </div>

        <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-stone-800 transition-transform duration-200 origin-left"
            style={{ transform: `scaleX(${Math.max(0, metrics.usagePercent / 100)})` }}
          />
        </div>

        <div className="flex flex-col gap-1.5 pt-1">
          {!isInstalled && (
            <button
              type="button"
              onClick={onInstallClick}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-stone-900 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install Web App</span>
            </button>
          )}

          {clips.length > 0 && (
            <button
              type="button"
              onClick={onClearAllClips}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Clips</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
