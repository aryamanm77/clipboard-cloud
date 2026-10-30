import React from 'react';
import { Download, Plus, QrCode } from 'lucide-react';
import type { FilterTab } from '../utils/uploadEngine.ts';

interface TopBarProps {
  activeTab: FilterTab;
  onSelectTab: (tab: FilterTab) => void;
  onFocusComposer: () => void;
  activeUploadCount: number;
  isInstalled: boolean;
  onInstallClick: () => void;
  workspaceId: string;
  onOpenQrModal: () => void;
}

export const AppBrandIcon: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg
    viewBox="0 0 512 512"
    aria-hidden="true"
    className={`${className} shrink-0 rounded-lg shadow-2xs`}
  >
    <rect width="512" height="512" rx="116" fill="#1C1917" />
    <rect x="116" y="104" width="280" height="324" rx="40" fill="#44403C" />
    <rect x="132" y="120" width="248" height="292" rx="28" fill="#FAFAF9" />
    <rect
      x="184"
      y="76"
      width="144"
      height="64"
      rx="22"
      fill="#D6D3D1"
      stroke="#1C1917"
      strokeWidth="10"
    />
    <rect x="220" y="98" width="72" height="20" rx="10" fill="#1C1917" />
    <rect x="168" y="188" width="144" height="20" rx="10" fill="#1C1917" />
    <rect x="168" y="228" width="176" height="16" rx="8" fill="#A8A29E" />
    <rect x="168" y="262" width="128" height="16" rx="8" fill="#A8A29E" />
    <circle cx="348" cy="364" r="48" fill="#10B981" stroke="#1C1917" strokeWidth="10" />
    <path
      d="M328 364 L342 378 L370 350"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="14"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onFocusComposer,
  activeUploadCount,
  isInstalled,
  onInstallClick,
  onOpenQrModal,
}) => {
  const navItems: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'text', label: 'Text' },
    { id: 'image', label: 'Images' },
    { id: 'file', label: 'Files' },
    {
      id: 'uploading',
      label: activeUploadCount > 0 ? `Uploading (${activeUploadCount})` : 'Uploading',
    },
  ];

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-6 py-3.5 bg-stone-100/90 backdrop-blur-md border-b border-stone-200">
      {/* Zone 1: Brand icon + wordmark */}
      <a
        href="#workspace-top"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('all');
        }}
        className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-stone-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
      >
        <AppBrandIcon className="w-7 h-7" />
        <span>Clipboard</span>
      </a>

      {/* Zone 2: Concise single-line navigation links */}
      <nav
        aria-label="Primary Navigation"
        className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-500"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                onSelectTab(item.id);
              }}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 ${
                isActive
                  ? 'border-stone-900 text-stone-900 font-semibold'
                  : 'border-transparent text-stone-500 hover:text-stone-900'
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Zone 3: Workspace QR Sync & Primary Action */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenQrModal}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>QR Sync</span>
        </button>

        {!isInstalled ? (
          <button
            type="button"
            onClick={onInstallClick}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-stone-900 rounded-xl hover:bg-stone-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install App</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onFocusComposer}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-stone-900 rounded-xl hover:bg-stone-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Clip</span>
          </button>
        )}
      </div>
    </header>
  );
};

