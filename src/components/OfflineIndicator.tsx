import React, { useEffect } from 'react';
import { WifiOff, X, Smartphone, Monitor } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall.ts';
import { AppBrandIcon } from './TopBar.tsx';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-medium text-stone-100 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>Offline — using saved clips</span>
    </div>
  );
};

interface PWAInstallModalProps {
  open: boolean;
  isIOS: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ open, isIOS, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white border border-stone-200 p-6 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AppBrandIcon className="w-10 h-10" />
            <div>
              <h3 id="pwa-install-title" className="text-base font-semibold text-stone-900">
                Install Clipboard
              </h3>
              <p className="text-xs text-stone-500">Add to your home screen or desktop</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install dialog"
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <div className="space-y-2.5 text-xs text-stone-600 bg-stone-50 p-3.5 rounded-xl border border-stone-200/80 leading-relaxed">
            <p className="font-medium text-stone-900 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" /> iPhone or iPad (Safari)
            </p>
            <p>1. Tap the <strong>Share</strong> icon in the browser bar.</p>
            <p>2. Select <strong>Add to Home Screen</strong>.</p>
          </div>
        ) : (
          <div className="space-y-2.5 text-xs text-stone-600 bg-stone-50 p-3.5 rounded-xl border border-stone-200/80 leading-relaxed">
            <p className="font-medium text-stone-900 flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5" /> Desktop or Android
            </p>
            <p>1. Open this app in its own browser tab if viewing in a preview frame.</p>
            <p>2. Click the <strong>Install</strong> icon in the address bar or browser menu.</p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );
};
