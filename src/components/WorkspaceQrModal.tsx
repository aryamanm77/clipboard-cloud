import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  X,
  Copy,
  Check,
  Smartphone,
  RefreshCw,
  ArrowRightLeft,
  Download,
  Shuffle,
  ClipboardPaste,
} from 'lucide-react';
import {
  DEFAULT_WORKSPACE_ID,
  resolveWorkspaceId,
  buildWorkspaceSyncUrl,
  generateRandomWorkspaceId,
} from '../utils/uploadEngine.ts';

interface WorkspaceQrModalProps {
  open: boolean;
  workspaceId: string;
  onChangeWorkspaceId: (newWorkspaceId: string) => void;
  onSyncLocalClipboard: (manualText?: string) => Promise<{
    syncedText: boolean;
    message: string;
  }>;
  onClose: () => void;
}

export const WorkspaceQrModal: React.FC<WorkspaceQrModalProps> = ({
  open,
  workspaceId,
  onChangeWorkspaceId,
  onSyncLocalClipboard,
  onClose,
}) => {
  const [qrSvg, setQrSvg] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [customIdInput, setCustomIdInput] = useState(workspaceId);
  const [manualClipText, setManualClipText] = useState('');
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://cloud.clipboard.app';
  const syncUrl = buildWorkspaceSyncUrl(origin, workspaceId, true);

  useEffect(() => {
    setCustomIdInput(workspaceId);
  }, [workspaceId, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toString(syncUrl, {
      type: 'svg',
      margin: 2,
      width: 220,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#1C1917',
        light: '#FFFFFF',
      },
    })
      .then((svgString) => {
        if (!cancelled) {
          setQrSvg(svgString);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrSvg('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [syncUrl, open]);

  if (!open) return null;

  const handleCopySyncLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(syncUrl);
      }
    } catch {
      // Fallback handled silently
    }
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyWorkspaceId = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(workspaceId);
      }
    } catch {
      // Fallback handled silently
    }
    setCopiedId(true);
    window.setTimeout(() => setCopiedId(false), 2000);
  };

  const handleDownloadQrSvg = () => {
    if (!qrSvg) return;
    const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `workspace-${workspaceId}-qr.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleSwitchWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    const resolved = resolveWorkspaceId(customIdInput);
    setCustomIdInput(resolved);
    onChangeWorkspaceId(resolved);
    setSyncFeedback(`Switched active cloud workspace to "${resolved}"`);
    window.setTimeout(() => setSyncFeedback(null), 3000);
  };

  const handleGenerateRandomWorkspace = () => {
    const nextId = generateRandomWorkspaceId();
    setCustomIdInput(nextId);
    onChangeWorkspaceId(nextId);
    setSyncFeedback(`Created & switched to workspace "${nextId}"`);
    window.setTimeout(() => setSyncFeedback(null), 3000);
  };

  const handleResetDefaultWorkspace = () => {
    setCustomIdInput(DEFAULT_WORKSPACE_ID);
    onChangeWorkspaceId(DEFAULT_WORKSPACE_ID);
    setSyncFeedback(`Switched to default workspace "${DEFAULT_WORKSPACE_ID}"`);
    window.setTimeout(() => setSyncFeedback(null), 3000);
  };

  const handleTriggerMobileClipboardSync = async () => {
    setIsSyncing(true);
    try {
      const result = await onSyncLocalClipboard(manualClipText.trim() || undefined);
      if (manualClipText.trim()) {
        setManualClipText('');
      }
      setSyncFeedback(result.message);
      window.setTimeout(() => setSyncFeedback(null), 3500);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-qr-modal-title"
    >
      <div className="w-full max-w-2xl bg-white border border-stone-200 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center shrink-0">
              <QrCode className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2
                id="workspace-qr-modal-title"
                className="text-base font-bold text-stone-900 tracking-tight"
              >
                Mobile QR Workspace Sync
              </h2>
              <p className="text-xs text-stone-500">
                Scan with your phone camera to pair &amp; sync your local clipboard with this cloud workspace
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR sync modal"
            className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left Column: QR Code Card */}
          <div className="md:col-span-5 flex flex-col items-center bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-3">
            <div
              data-testid="workspace-qr-svg"
              className="w-52 h-52 bg-white border border-stone-200 rounded-xl p-2 flex items-center justify-center shadow-2xs"
            >
              {qrSvg ? (
                <div
                  className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <span className="text-xs text-stone-400 font-mono">Generating QR...</span>
              )}
            </div>

            <div className="text-center space-y-0.5 w-full">
              <div className="text-[11px] text-stone-500">Active Workspace ID</div>
              <div
                data-testid="active-workspace-id-label"
                className="font-mono text-xs font-semibold text-stone-900 truncate px-2"
              >
                {workspaceId}
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadQrSvg}
              disabled={!qrSvg}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download QR SVG</span>
            </button>
          </div>

          {/* Right Column: Sync Link, Mobile Clipboard Push, and Workspace Switcher */}
          <div className="md:col-span-7 space-y-5">
            {/* Section 1: Shareable Sync Link & ID */}
            <div className="space-y-2">
              <label
                htmlFor="workspace-sync-url-read"
                className="block text-xs font-semibold text-stone-800"
              >
                Mobile Sync Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="workspace-sync-url-read"
                  type="text"
                  readOnly
                  value={syncUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 px-3 py-2 text-xs font-mono text-stone-700 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopySyncLink}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-stone-900 rounded-xl hover:bg-stone-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied Link</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Sync Link</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between pt-0.5 text-xs text-stone-500">
                <span>
                  Workspace ID: <strong className="font-mono text-stone-800">{workspaceId}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleCopyWorkspaceId}
                  className="inline-flex items-center gap-1 text-xs font-medium text-stone-700 hover:text-stone-900 underline underline-offset-2 cursor-pointer"
                >
                  {copiedId ? 'Copied ID' : 'Copy Workspace ID'}
                </button>
              </div>
            </div>

            {/* Section 2: Quick Mobile Clipboard Sync */}
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-900">
                  <Smartphone className="w-3.5 h-3.5 text-stone-600" />
                  <span>Instant Local Clipboard Sync</span>
                </span>
                <span className="text-[11px] text-stone-500">Two-way cloud sync</span>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  aria-label="Mobile clipboard text to sync"
                  value={manualClipText}
                  onChange={(e) => setManualClipText(e.target.value)}
                  placeholder="Paste mobile clipboard text here, or tap Sync below..."
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg text-stone-800 placeholder:text-stone-400 focus:outline-2 focus:outline-stone-900"
                />
                <button
                  type="button"
                  onClick={handleTriggerMobileClipboardSync}
                  disabled={isSyncing}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  {manualClipText.trim() ? (
                    <ClipboardPaste className="w-3.5 h-3.5" />
                  ) : (
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  )}
                  <span>Sync Clipboard Now</span>
                </button>
              </div>
            </div>

            {/* Section 3: Switch or Create Workspace ID */}
            <form onSubmit={handleSwitchWorkspace} className="space-y-2 pt-1 border-t border-stone-200">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="workspace-id-input"
                  className="block text-xs font-semibold text-stone-800"
                >
                  Switch or Create Workspace ID
                </label>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={handleGenerateRandomWorkspace}
                    className="inline-flex items-center gap-1 text-stone-600 hover:text-stone-900 font-medium cursor-pointer"
                  >
                    <Shuffle className="w-3 h-3" />
                    <span>New Random ID</span>
                  </button>
                  {workspaceId !== DEFAULT_WORKSPACE_ID && (
                    <button
                      type="button"
                      onClick={handleResetDefaultWorkspace}
                      className="text-stone-600 hover:text-stone-900 font-medium underline underline-offset-2 cursor-pointer"
                    >
                      Reset Default
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="workspace-id-input"
                  type="text"
                  value={customIdInput}
                  onChange={(e) => setCustomIdInput(e.target.value)}
                  placeholder="e.g. public-workspace or team-sync-01"
                  className="flex-1 min-w-0 px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-xl text-stone-900 focus:outline-2 focus:outline-stone-900"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-900 bg-stone-100 border border-stone-300 rounded-xl hover:bg-stone-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Switch Workspace</span>
                </button>
              </div>
            </form>

            {syncFeedback && (
              <p
                role="status"
                className="text-xs font-medium text-emerald-700 bg-emerald-50/80 border border-emerald-200 px-3 py-2 rounded-xl"
              >
                {syncFeedback}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
