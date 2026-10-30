import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { TopBar } from './components/TopBar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { PasteComposer, type NamedUploadFile } from './components/PasteComposer.tsx';
import { UploadQueuePanel } from './components/UploadQueuePanel.tsx';
import { ClipStream } from './components/ClipStream.tsx';
import { ClipInspectorModal } from './components/ClipInspectorModal.tsx';
import { DeletePasswordModal } from './components/DeletePasswordModal.tsx';
import { WorkspaceQrModal } from './components/WorkspaceQrModal.tsx';
import { OfflineIndicator, PWAInstallModal } from './components/OfflineIndicator.tsx';
import { usePWAInstall } from './hooks/usePWAInstall.ts';
import {
  db,
  WORKSPACE_OWNER_ID,
  DELETED_STORAGE_KEY,
  OperationType,
  handleFirestoreError,
  markClipConfirmedInFirestore,
  markClipDeletedInFirestore,
  saveClipToFirestore,
  updateClipStatusInFirestore,
  updateClipPinInFirestore,
  updateClipTitleInFirestore,
  loadClipChunksFromFirestore,
  deleteClipFromFirestore,
} from './firebase.ts';
import {
  saveClipBlob,
  loadClipBlob,
  deleteClipBlob,
  clearAllClipBlobs,
} from './utils/blobStorage.ts';
import {
  SYNC_SPEED_PROFILES,
  DOCX_MIME_TYPE,
  DOC_MIME_TYPE,
  detectClipCategory,
  computeDeterministicHash,
  advanceClipUpload,
  normalizeClipUploadState,
  filterClips,
  calculateStorageMetrics,
  verifyDeletePassword,
  toggleSelection,
  selectAllVisible,
  formatBatchCopyPayload,
  resolveUploadFileName,
  dataUrlToUint8Array,
  extractTextFromDocxBytes,
  getClipDownloadPayload,
  formatBytes,
  mergeClipsCrossDevice,
  resolveWorkspaceId,
  parseWorkspaceFromSearch,
  type ClipItem,
  type FilterTab,
  type SyncSpeedProfileId,
} from './utils/uploadEngine.ts';

const STORAGE_KEY = 'clipboard_cloud_workspace_v3';
const WORKSPACE_ID_STORAGE_KEY = 'clipboard_active_workspace_v1';

function loadPersistedDeletedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const set = new Set<string>();
        parsed.forEach((id) => {
          if (typeof id === 'string' && id) {
            set.add(id);
            markClipDeletedInFirestore(id);
          }
        });
        return set;
      }
    }
  } catch {
    // Ignore storage read error
  }
  return new Set<string>();
}

function saveDeletedIdsToStorage(deletedIds: Set<string>): void {
  try {
    localStorage.setItem(
      DELETED_STORAGE_KEY,
      JSON.stringify(Array.from(deletedIds).slice(-500))
    );
  } catch {
    // Ignore storage quota error
  }
}

function saveClipsToStorage(items: ClipItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    try {
      const compactClips = items.map((c) =>
        c.fileDataUrl && c.fileDataUrl.length > 512 * 1024
          ? { ...c, fileDataUrl: undefined }
          : c
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compactClips));
    } catch {
      // Ignore quota exceeded
    }
  }
}

type PendingDeleteRequest =
  | { type: 'single'; id: string; label: string }
  | { type: 'batch'; ids: string[]; label: string }
  | { type: 'clear-synced'; label: string }
  | { type: 'clear-all'; label: string };

export default function App() {
  const deletedIdsRef = useRef<Set<string>>(loadPersistedDeletedIds());
  const maxProgressByClipRef = useRef<
    Map<
      string,
      {
        progress: number;
        elapsedMs: number;
        uploadedBytes: number;
        status: ClipItem['status'];
      }
    >
  >(new Map());
  const purgedFromFirestoreRef = useRef<Set<string>>(new Set());

  const applyMonotonicAndDeleteGuards = useCallback((items: ClipItem[]): ClipItem[] => {
    const filtered: ClipItem[] = [];
    for (const raw of items) {
      if (!raw || !raw.id || deletedIdsRef.current.has(raw.id)) continue;
      const prevBest = maxProgressByClipRef.current.get(raw.id);
      let nextStatus = raw.status;
      let nextProgress = raw.progress || 0;
      let nextElapsed = raw.elapsedMs || 0;
      let nextUploaded = raw.uploadedBytes || 0;

      if (prevBest) {
        nextProgress = Math.max(prevBest.progress, nextProgress);
        nextElapsed = Math.max(prevBest.elapsedMs, nextElapsed);
        nextUploaded = Math.max(prevBest.uploadedBytes, nextUploaded);
        if (prevBest.status === 'synced' || nextProgress >= 100) {
          nextStatus = 'synced';
          nextProgress = 100;
          nextElapsed = Math.max(nextElapsed, raw.totalDurationMs || 4500);
          nextUploaded = Math.max(nextUploaded, raw.sizeBytes || 0);
        }
      }

      maxProgressByClipRef.current.set(raw.id, {
        progress: nextProgress,
        elapsedMs: nextElapsed,
        uploadedBytes: nextUploaded,
        status: nextStatus,
      });

      filtered.push({
        ...raw,
        status: nextStatus,
        progress: nextProgress,
        elapsedMs: nextElapsed,
        uploadedBytes: nextUploaded,
      });
    }
    return filtered;
  }, []);

  const [clips, setClips] = useState<ClipItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const nowMs = Date.now();
          return parsed
            .filter((c: ClipItem) => c && c.id && !deletedIdsRef.current.has(c.id))
            .map((c: ClipItem) => normalizeClipUploadState(c, nowMs));
        }
      }
    } catch {
      // Fallback to empty clips list
    }
    return [];
  });

  const [workspaceId, setWorkspaceId] = useState<string>(() => {
    try {
      const fromUrl = parseWorkspaceFromSearch(window.location.search);
      if (fromUrl.workspaceId) {
        localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, fromUrl.workspaceId);
        return fromUrl.workspaceId;
      }
      const savedWs = localStorage.getItem(WORKSPACE_ID_STORAGE_KEY);
      if (savedWs) {
        return resolveWorkspaceId(savedWs);
      }
    } catch {
      // Ignore storage error
    }
    return WORKSPACE_OWNER_ID;
  });
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [speedProfile, setSpeedProfile] = useState<SyncSpeedProfileId>('standard');
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);
  const [inspectedClipId, setInspectedClipId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteRequest | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchCopied, setBatchCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const clipsRef = useRef<ClipItem[]>(clips);
  const syncedToFirestoreRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  const {
    isInstalled,
    isIOS,
    showInstallSheet,
    setShowInstallSheet,
    triggerInstall,
  } = usePWAInstall();

  // Automatic Cross-Device Sync Helper: hydrates local IndexedDB blobs and syncs with /api/clips/sync
  const syncWorkspaceAcrossDevices = useCallback(
    async (pushLocal: boolean = true) => {
      try {
        let storedClips: ClipItem[] = [];
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              storedClips = parsed;
            }
          }
        } catch {
          // Ignore parse error
        }

        const currentLocal = mergeClipsCrossDevice(
          clipsRef.current,
          storedClips,
          deletedIdsRef.current
        );

        const hydratedLocal = await Promise.all(
          currentLocal.map(async (clip) => {
            if (
              (clip.category === 'file' || clip.category === 'image') &&
              !clip.fileDataUrl
            ) {
              const stored = await loadClipBlob(clip.id);
              if (stored) {
                return { ...clip, fileDataUrl: stored };
              }
            }
            return clip;
          })
        );

        const shouldPost =
          pushLocal && (hydratedLocal.length > 0 || deletedIdsRef.current.size > 0);
        const endpoint = shouldPost ? '/api/clips/sync' : '/api/clips';
        const res = await fetch(endpoint, {
          method: shouldPost ? 'POST' : 'GET',
          cache: 'no-store',
          headers: shouldPost ? { 'Content-Type': 'application/json' } : undefined,
          body: shouldPost
            ? JSON.stringify({
                clips: hydratedLocal,
                deletedIds: Array.from(deletedIdsRef.current),
              })
            : undefined,
        });

        if (!res.ok) return;
        const data = await res.json();
        const serverDeleted: string[] = Array.isArray(data?.deletedIds)
          ? data.deletedIds
          : [];
        let deletedChanged = false;
        serverDeleted.forEach((id) => {
          if (typeof id === 'string' && id) {
            if (!deletedIdsRef.current.has(id)) {
              deletedIdsRef.current.add(id);
              deletedChanged = true;
            }
            markClipDeletedInFirestore(id);
          }
        });
        if (deletedChanged) {
          saveDeletedIdsToStorage(deletedIdsRef.current);
        }

        const remoteClips: ClipItem[] = Array.isArray(data?.clips) ? data.clips : [];
        remoteClips.forEach((rc) => {
          if (rc && rc.id) {
            syncedToFirestoreRef.current.add(rc.id);
          }
          if (rc.fileDataUrl && !deletedIdsRef.current.has(rc.id)) {
            saveClipBlob(rc.id, rc.fileDataUrl).catch(() => {});
          }
        });

        setClips((prev) =>
          applyMonotonicAndDeleteGuards(
            mergeClipsCrossDevice(prev, remoteClips, deletedIdsRef.current)
          )
        );
      } catch {
        // Network offline or transient error
      }
    },
    [applyMonotonicAndDeleteGuards]
  );

  // Zero-click automatic up-sync on mount + background cross-PC polling + window focus sync
  useEffect(() => {
    syncWorkspaceAcrossDevices(true);

    const pollInterval = window.setInterval(() => {
      syncWorkspaceAcrossDevices(false);
    }, 2500);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        syncWorkspaceAcrossDevices(true);
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(pollInterval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [syncWorkspaceAcrossDevices]);

  // Real-time Firebase Firestore onSnapshot listener (automatic without requiring sign-in)
  useEffect(() => {
    const clipsPath = 'clips';
    const q = query(collection(db, clipsPath), where('ownerId', '==', workspaceId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const firestoreClips: ClipItem[] = [];
        const chunksToHydrate: { id: string; chunkCount: number }[] = [];
        const nowMs = Date.now();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const clipId = data.id || docSnap.id;
          if (
            deletedIdsRef.current.has(clipId) ||
            deletedIdsRef.current.has(docSnap.id)
          ) {
            if (!purgedFromFirestoreRef.current.has(clipId)) {
              purgedFromFirestoreRef.current.add(clipId);
              deleteClipFromFirestore(clipId, workspaceId).catch(() => {});
            }
            return;
          }

          if (!docSnap.metadata.hasPendingWrites) {
            markClipConfirmedInFirestore(clipId);
          }
          syncedToFirestoreRef.current.add(clipId);
          const inlineUrl =
            typeof data.inlineDataUrl === 'string' && data.inlineDataUrl.length > 0
              ? data.inlineDataUrl
              : undefined;

          if (inlineUrl) {
            saveClipBlob(clipId, inlineUrl).catch(() => {});
          } else if (typeof data.chunkCount === 'number' && data.chunkCount > 0) {
            chunksToHydrate.push({ id: clipId, chunkCount: data.chunkCount });
          }

          const rawClip: ClipItem = {
            id: clipId,
            title: data.title || 'Untitled',
            category: data.category || 'text',
            content: data.content || '',
            fileDataUrl: inlineUrl,
            extractedText: data.extractedText || undefined,
            mimeType: data.mimeType || 'text/plain',
            sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : 512,
            createdAt: data.createdAtIso || new Date().toISOString(),
            status: data.status || 'synced',
            progress: typeof data.progress === 'number' ? data.progress : 100,
            uploadedBytes:
              typeof data.uploadedBytes === 'number'
                ? data.uploadedBytes
                : data.sizeBytes || 512,
            totalDurationMs:
              typeof data.totalDurationMs === 'number' ? data.totalDurationMs : 4500,
            elapsedMs: typeof data.elapsedMs === 'number' ? data.elapsedMs : 4500,
            region: data.region || 'Cloud',
            sha256: data.sha256 || 'sha256:00000000',
            cloudUrl: data.cloudUrl || `https://cloud.clipboard.app/c/${clipId}`,
            pinned: Boolean(data.pinned),
            ttlLabel: data.ttlLabel || '7 days',
            deviceSource: data.deviceSource || 'Web App',
            fileExtension: data.fileExtension || undefined,
          };

          const normalizedClip = normalizeClipUploadState(rawClip, nowMs);
          if (rawClip.status === 'uploading' && normalizedClip.status === 'synced') {
            updateClipStatusInFirestore(
              clipId,
              'synced',
              100,
              normalizedClip.sizeBytes,
              normalizedClip.totalDurationMs
            ).catch(() => {});
          }

          firestoreClips.push(normalizedClip);
        });

        setClips((prev) =>
          applyMonotonicAndDeleteGuards(
            mergeClipsCrossDevice(prev, firestoreClips, deletedIdsRef.current)
          )
        );

        if (firestoreClips.length > 0 || deletedIdsRef.current.size > 0) {
          fetch('/api/clips/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clips: firestoreClips,
              deletedIds: Array.from(deletedIdsRef.current),
            }),
          }).catch(() => {});
        }

        // Hydrate multi-chunk binary files from Firestore subcollection automatically
        chunksToHydrate.forEach(async ({ id }) => {
          if (deletedIdsRef.current.has(id)) return;
          const existingLocal = await loadClipBlob(id);
          if (existingLocal) {
            setClips((prev) => {
              const needsUpdate = prev.some((c) => c.id === id && !c.fileDataUrl);
              if (!needsUpdate) return prev;
              return prev.map((c) =>
                c.id === id && !c.fileDataUrl ? { ...c, fileDataUrl: existingLocal } : c
              );
            });
            return;
          }
          const assembled = await loadClipChunksFromFirestore(id, workspaceId);
          if (assembled && !deletedIdsRef.current.has(id)) {
            await saveClipBlob(id, assembled).catch(() => {});
            setClips((prev) => {
              const needsUpdate = prev.some((c) => c.id === id && !c.fileDataUrl);
              if (!needsUpdate) return prev;
              return prev.map((c) =>
                c.id === id ? { ...c, fileDataUrl: assembled } : c
              );
            });
          }
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, clipsPath);
      }
    );

    return () => unsubscribe();
  }, [applyMonotonicAndDeleteGuards, workspaceId]);

  // Automatically push any local clips not yet in Firestore to Firestore
  useEffect(() => {
    if (clips.length === 0) return;

    const unsynced = clips.filter(
      (c) => !syncedToFirestoreRef.current.has(c.id) && !deletedIdsRef.current.has(c.id)
    );
    if (unsynced.length === 0) return;

    unsynced.forEach(async (clip) => {
      syncedToFirestoreRef.current.add(clip.id);
      if (deletedIdsRef.current.has(clip.id)) return;
      let fullClip = clip;
      if (!clip.fileDataUrl && (clip.category === 'file' || clip.category === 'image')) {
        const blob = await loadClipBlob(clip.id);
        if (blob) {
          fullClip = { ...clip, fileDataUrl: blob };
        }
      }
      if (deletedIdsRef.current.has(clip.id)) return;
      const latestInState = clipsRef.current.find((c) => c.id === clip.id);
      const mergedToSave = latestInState
        ? { ...fullClip, ...latestInState, fileDataUrl: fullClip.fileDataUrl || latestInState.fileDataUrl }
        : fullClip;
      await saveClipToFirestore(mergedToSave, workspaceId).catch(() => {});
    });
  }, [clips, workspaceId]);

  // Hydrate any missing binary fileDataUrl from IndexedDB (for large PDFs / Word docs)
  useEffect(() => {
    let cancelled = false;
    const missingBlobs = clips.filter(
      (c) => (c.category === 'file' || c.category === 'image') && !c.fileDataUrl
    );
    if (missingBlobs.length === 0) return;

    Promise.all(
      missingBlobs.map(async (c) => {
        const stored = await loadClipBlob(c.id);
        return { id: c.id, stored };
      })
    ).then((results) => {
      if (cancelled) return;
      const hydratedMap = new Map<string, string>();
      results.forEach(({ id, stored }) => {
        if (stored && !deletedIdsRef.current.has(id)) hydratedMap.set(id, stored);
      });
      if (hydratedMap.size > 0) {
        setClips((prev) => {
          const needsUpdate = prev.some((c) => hydratedMap.has(c.id) && !c.fileDataUrl);
          if (!needsUpdate) return prev;
          return prev.map((c) =>
            hydratedMap.has(c.id) && !c.fileDataUrl
              ? { ...c, fileDataUrl: hydratedMap.get(c.id) }
              : c
          );
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [clips.length]);

  useEffect(() => {
    saveClipsToStorage(clips);
  }, [clips]);

  // Timed Cloud Upload Progress Loop: decoupled from [clips] so background updates never reset the timer
  const hasActiveUploads = clips.some((c) => c.status === 'uploading');
  useEffect(() => {
    if (!hasActiveUploads) return;

    let lastTickMs = Date.now();
    const interval = window.setInterval(() => {
      const nowMs = Date.now();
      const deltaMs = Math.max(50, Math.min(500, nowMs - lastTickMs));
      lastTickMs = nowMs;

      setClips((prevClips) =>
        applyMonotonicAndDeleteGuards(
          prevClips.map((clip) => {
            if (clip.status !== 'uploading') return clip;
            const updated = advanceClipUpload(clip, deltaMs);
            if (updated.status === 'synced') {
              fetch(`/api/clips/${clip.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  status: 'synced',
                  progress: 100,
                  uploadedBytes: updated.sizeBytes,
                  elapsedMs: updated.totalDurationMs,
                }),
              }).catch(() => {});
              updateClipStatusInFirestore(
                clip.id,
                'synced',
                100,
                updated.sizeBytes,
                updated.totalDurationMs
              ).catch(() => {});
            }
            return updated;
          })
        )
      );
    }, 100);

    return () => window.clearInterval(interval);
  }, [hasActiveUploads, applyMonotonicAndDeleteGuards]);

  const enqueueNewClip = useCallback(
    (params: {
      title: string;
      content: string;
      fileDataUrl?: string;
      extractedText?: string;
      mimeType: string;
      sizeBytes: number;
      ttlLabel: string;
      dimensions?: string;
      fileExtension?: string;
    }) => {
      const profile = SYNC_SPEED_PROFILES[speedProfile];
      const id = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const category = detectClipCategory(params.content, params.mimeType, params.title);

      const sizeMultiplier =
        params.sizeBytes > 1024 * 1024 ? 1.35 : params.sizeBytes > 100 * 1024 ? 1.15 : 1.0;
      const totalDurationMs = Math.round(profile.targetDurationMs * sizeMultiplier);

      if (params.fileDataUrl) {
        saveClipBlob(id, params.fileDataUrl).catch(() => {});
      }

      const newClip: ClipItem = {
        id,
        title: params.title,
        category,
        content: params.content,
        fileDataUrl: params.fileDataUrl,
        extractedText: params.extractedText,
        mimeType: params.mimeType,
        sizeBytes: Math.max(64, params.sizeBytes),
        createdAt: new Date().toISOString(),
        status: 'uploading',
        progress: 0,
        uploadedBytes: 0,
        totalDurationMs,
        elapsedMs: 0,
        region: 'Cloud',
        sha256: computeDeterministicHash(`${params.title}:${params.content.slice(0, 256)}`),
        cloudUrl: `https://cloud.clipboard.app/c/${id}`,
        pinned: false,
        ttlLabel: params.ttlLabel,
        deviceSource: 'Web App',
        dimensions: params.dimensions,
        fileExtension: params.fileExtension,
      };

      deletedIdsRef.current.delete(id);
      maxProgressByClipRef.current.set(id, {
        progress: 0,
        elapsedMs: 0,
        uploadedBytes: 0,
        status: 'uploading',
      });
      syncedToFirestoreRef.current.add(id);
      setClips((prev) => [newClip, ...prev]);

      fetch('/api/clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClip),
      }).catch(() => {});

      saveClipToFirestore(newClip, workspaceId).catch(() => {});
    },
    [speedProfile, workspaceId]
  );

  const handleCreateTextClip = useCallback(
    (title: string, content: string, ttlLabel: string) => {
      const byteLength = new Blob([content]).size;
      const category = detectClipCategory(content, 'text/plain', title);
      enqueueNewClip({
        title,
        content,
        mimeType: category === 'code' ? 'application/typescript' : 'text/plain',
        sizeBytes: Math.max(512, byteLength),
        ttlLabel,
      });
    },
    [enqueueNewClip]
  );

  const handleUploadFiles = useCallback(
    (
      fileList: FileList | File[] | NamedUploadFile[],
      ttlLabel: string,
      customTitle?: string
    ) => {
      const items: NamedUploadFile[] = Array.from(fileList as ArrayLike<File | NamedUploadFile>).map(
        (item, idx, arr) => {
          if ('file' in item && item.file instanceof File) {
            return item;
          }
          const rawFile = item as File;
          const prefix =
            customTitle && customTitle.trim()
              ? arr.length === 1
                ? customTitle.trim()
                : `${customTitle.trim()} (${idx + 1})`
              : '';
          return {
            file: rawFile,
            customName: resolveUploadFileName(prefix, rawFile.name),
          };
        }
      );

      items.forEach(({ file, customName }) => {
        const finalTitle = customName || file.name || `File_${Date.now()}`;
        const ext = finalTitle.includes('.')
          ? finalTitle.split('.').pop()?.toUpperCase() || 'FILE'
          : file.name.includes('.')
            ? file.name.split('.').pop()?.toUpperCase() || 'FILE'
            : 'FILE';

        const lowerTitle = finalTitle.toLowerCase();
        const isImage = file.type.startsWith('image/');
        const isPdf =
          file.type === 'application/pdf' ||
          ext === 'PDF' ||
          lowerTitle.endsWith('.pdf');
        const isWord =
          ext === 'DOCX' ||
          ext === 'DOC' ||
          lowerTitle.endsWith('.docx') ||
          lowerTitle.endsWith('.doc') ||
          file.type.includes('wordprocessingml') ||
          file.type === 'application/msword';
        const isText =
          !isPdf &&
          !isWord &&
          (file.type.startsWith('text/') ||
            /\.(txt|md|json|ts|tsx|js|jsx|py|sql|csv|yaml|yml|html|css|sh)$/i.test(file.name));

        if (isImage) {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              enqueueNewClip({
                title: finalTitle,
                content: reader.result,
                fileDataUrl: reader.result,
                mimeType: file.type || 'image/png',
                sizeBytes: file.size || 640000,
                ttlLabel,
                fileExtension: ext,
              });
            }
          };
          reader.readAsDataURL(file);
        } else if (isText && file.size < 512 * 1024) {
          const reader = new FileReader();
          reader.onload = () => {
            const textContent =
              typeof reader.result === 'string' ? reader.result : `File: ${finalTitle}`;
            enqueueNewClip({
              title: finalTitle,
              content: textContent,
              mimeType: file.type || 'text/plain',
              sizeBytes: file.size || new Blob([textContent]).size,
              ttlLabel,
              fileExtension: ext,
            });
          };
          reader.readAsText(file);
        } else {
          // Read full binary data URL so PDFs, Word documents (.docx/.doc), and binary files can be viewed and downloaded intact
          const reader = new FileReader();
          reader.onload = async () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : undefined;
            const resolvedMime = isPdf
              ? 'application/pdf'
              : isWord
                ? lowerTitle.endsWith('.doc')
                  ? DOC_MIME_TYPE
                  : DOCX_MIME_TYPE
                : file.type || 'application/octet-stream';

            let extractedText: string | undefined;
            if (isWord && dataUrl) {
              const decoded = dataUrlToUint8Array(dataUrl);
              if (decoded) {
                const text = await extractTextFromDocxBytes(decoded.bytes);
                if (text && text.trim()) {
                  extractedText = text.trim();
                }
              }
            }

            const summaryLabel = isPdf
              ? 'PDF Document'
              : isWord
                ? 'Word Document'
                : resolvedMime;

            enqueueNewClip({
              title: finalTitle,
              content:
                extractedText ||
                `${finalTitle} · ${summaryLabel} (${formatBytes(file.size || 0)})`,
              fileDataUrl: dataUrl,
              extractedText,
              mimeType: resolvedMime,
              sizeBytes: file.size || 64000,
              ttlLabel,
              fileExtension: isPdf ? 'PDF' : isWord ? (lowerTitle.endsWith('.doc') ? 'DOC' : 'DOCX') : ext,
            });
          };
          reader.readAsDataURL(file);
        }
      });
    },
    [enqueueNewClip]
  );

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.clipboardData) {
        if (e.clipboardData.files && e.clipboardData.files.length > 0) {
          e.preventDefault();
          handleUploadFiles(e.clipboardData.files, '7 days');
          return;
        }
        const pastedText = e.clipboardData.getData('text/plain');
        if (pastedText && pastedText.trim()) {
          e.preventDefault();
          const firstLine = pastedText.trim().split('\n')[0].slice(0, 48);
          handleCreateTextClip(firstLine || 'Pasted Text', pastedText, '7 days');
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [handleCreateTextClip, handleUploadFiles]);

  const handleTogglePauseUpload = (id: string) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const nextStatus = c.status === 'paused' ? 'uploading' : 'paused';
        return { ...c, status: nextStatus };
      })
    );
  };

  const handleCompleteUploadNow = (id: string) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated: ClipItem = {
          ...c,
          status: 'synced',
          progress: 100,
          uploadedBytes: c.sizeBytes,
          elapsedMs: c.totalDurationMs,
        };
        fetch(`/api/clips/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'synced',
            progress: 100,
            uploadedBytes: c.sizeBytes,
            elapsedMs: c.totalDurationMs,
          }),
        }).catch(() => {});
        updateClipStatusInFirestore(
          id,
          'synced',
          100,
          c.sizeBytes,
          c.totalDurationMs
        ).catch(() => {});
        return updated;
      })
    );
  };

  const handleRenameClip = (id: string, newTitle: string) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const resolved =
          c.category === 'file' || c.category === 'image'
            ? resolveUploadFileName(newTitle, c.title)
            : newTitle.trim();
        fetch(`/api/clips/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: resolved }),
        }).catch(() => {});
        updateClipTitleInFirestore(id, resolved, c.fileExtension || '').catch(() => {});
        return { ...c, title: resolved };
      })
    );
  };

  const hydrateClipBinaryPayload = useCallback(async (clip: ClipItem): Promise<ClipItem> => {
    if (clip.fileDataUrl) return clip;
    if (clip.category !== 'file' && clip.category !== 'image') return clip;

    // 1. Try IndexedDB
    const storedDataUrl = await loadClipBlob(clip.id);
    if (storedDataUrl) {
      setClips((prev) =>
        prev.map((c) => (c.id === clip.id ? { ...c, fileDataUrl: storedDataUrl } : c))
      );
      return { ...clip, fileDataUrl: storedDataUrl };
    }

    // 2. Try Firestore chunks
    const firestoreDataUrl = await loadClipChunksFromFirestore(clip.id, workspaceId);
    if (firestoreDataUrl) {
      await saveClipBlob(clip.id, firestoreDataUrl).catch(() => {});
      setClips((prev) =>
        prev.map((c) => (c.id === clip.id ? { ...c, fileDataUrl: firestoreDataUrl } : c))
      );
      return { ...clip, fileDataUrl: firestoreDataUrl };
    }

    // 3. Try backend /api/clips/:id
    try {
      const res = await fetch(`/api/clips/${clip.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.clip?.fileDataUrl) {
          await saveClipBlob(clip.id, data.clip.fileDataUrl).catch(() => {});
          setClips((prev) =>
            prev.map((c) =>
              c.id === clip.id ? { ...c, fileDataUrl: data.clip.fileDataUrl } : c
            )
          );
          return { ...clip, fileDataUrl: data.clip.fileDataUrl };
        }
      }
    } catch {
      // Fallback to synthetic generation if offline
    }

    return clip;
  }, [workspaceId]);

  const handleInspectClip = useCallback(
    async (clip: ClipItem) => {
      setInspectedClipId(clip.id);
      if (!clip.fileDataUrl && (clip.category === 'file' || clip.category === 'image')) {
        await hydrateClipBinaryPayload(clip);
      }
    },
    [hydrateClipBinaryPayload]
  );

  const handleDownloadClip = async (
    clip: ClipItem,
    format: boolean | 'native' | 'pdf' | 'docx' = 'native'
  ) => {
    const hydratedClip = await hydrateClipBinaryPayload(clip);
    const payload = getClipDownloadPayload(hydratedClip, format);
    const blob = new Blob([payload.bytes.buffer as ArrayBuffer], { type: payload.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = payload.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 15000);
  };

  const requestDeleteClip = (id: string) => {
    const target = clips.find((c) => c.id === id);
    setPendingDelete({
      type: 'single',
      id,
      label: target ? `Delete "${target.title}"` : 'Delete clip',
    });
  };

  const requestDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setPendingDelete({
      type: 'batch',
      ids: selectedIds,
      label: `Delete ${selectedIds.length} selected ${selectedIds.length === 1 ? 'clip' : 'clips'}`,
    });
  };

  const requestClearSynced = () => {
    setPendingDelete({
      type: 'clear-synced',
      label: 'Clear unpinned saved clips',
    });
  };

  const requestClearAllClips = () => {
    setPendingDelete({
      type: 'clear-all',
      label: `Clear all ${clips.length} clips`,
    });
  };

  const handleConfirmDeleteWithPassword = (password: string) => {
    if (!pendingDelete || !verifyDeletePassword(password)) return;

    if (pendingDelete.type === 'single') {
      const targetId = pendingDelete.id;
      deletedIdsRef.current.add(targetId);
      purgedFromFirestoreRef.current.add(targetId);
      markClipDeletedInFirestore(targetId);
      saveDeletedIdsToStorage(deletedIdsRef.current);
      deleteClipBlob(targetId).catch(() => {});

      const nextClips = clipsRef.current.filter((c) => c.id !== targetId);
      clipsRef.current = nextClips;
      saveClipsToStorage(nextClips);
      setClips(nextClips);

      setSelectedIds((prev) => prev.filter((id) => id !== targetId));
      if (inspectedClipId === targetId) {
        setInspectedClipId(null);
      }
      fetch(`/api/clips/${targetId}`, {
        method: 'DELETE',
        headers: { 'x-delete-password': password },
      }).catch(() => {});
      deleteClipFromFirestore(targetId, workspaceId).catch(() => {});
    } else if (pendingDelete.type === 'batch') {
      const idSet = new Set(pendingDelete.ids);
      pendingDelete.ids.forEach((id) => {
        deletedIdsRef.current.add(id);
        purgedFromFirestoreRef.current.add(id);
        markClipDeletedInFirestore(id);
        deleteClipBlob(id).catch(() => {});
        deleteClipFromFirestore(id, workspaceId).catch(() => {});
      });
      saveDeletedIdsToStorage(deletedIdsRef.current);

      const nextClips = clipsRef.current.filter((c) => !idSet.has(c.id));
      clipsRef.current = nextClips;
      saveClipsToStorage(nextClips);
      setClips(nextClips);

      setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
      if (inspectedClipId && idSet.has(inspectedClipId)) {
        setInspectedClipId(null);
      }
      fetch('/api/clips/delete-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-delete-password': password,
        },
        body: JSON.stringify({ ids: pendingDelete.ids, password }),
      }).catch(() => {});
    } else if (pendingDelete.type === 'clear-synced') {
      const removed = clipsRef.current.filter((c) => !c.pinned && c.status === 'synced');
      removed.forEach((c) => {
        deletedIdsRef.current.add(c.id);
        purgedFromFirestoreRef.current.add(c.id);
        markClipDeletedInFirestore(c.id);
        deleteClipBlob(c.id).catch(() => {});
        deleteClipFromFirestore(c.id, workspaceId).catch(() => {});
      });
      saveDeletedIdsToStorage(deletedIdsRef.current);

      const remaining = clipsRef.current.filter((c) => c.pinned || c.status !== 'synced');
      const remainingIds = new Set(remaining.map((c) => c.id));
      clipsRef.current = remaining;
      saveClipsToStorage(remaining);
      setClips(remaining);
      setSelectedIds((prev) => prev.filter((id) => remainingIds.has(id)));
      fetch('/api/clips/clear-synced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-delete-password': password,
        },
        body: JSON.stringify({ password }),
      }).catch(() => {});
    } else if (pendingDelete.type === 'clear-all') {
      clipsRef.current.forEach((c) => {
        deletedIdsRef.current.add(c.id);
        purgedFromFirestoreRef.current.add(c.id);
        markClipDeletedInFirestore(c.id);
        deleteClipFromFirestore(c.id, workspaceId).catch(() => {});
      });
      saveDeletedIdsToStorage(deletedIdsRef.current);
      clearAllClipBlobs().catch(() => {});

      clipsRef.current = [];
      saveClipsToStorage([]);
      setClips([]);
      setSelectedIds([]);
      setInspectedClipId(null);
      setActiveTab('all');
      setSearchQuery('');
      fetch('/api/clips/clear-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-delete-password': password,
        },
        body: JSON.stringify({ password }),
      }).catch(() => {});
    }

    setPendingDelete(null);
  };

  const handleTogglePin = (id: string) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const nextPinned = !c.pinned;
        fetch(`/api/clips/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinned: nextPinned }),
        }).catch(() => {});
        updateClipPinInFirestore(id, nextPinned).catch(() => {});
        return { ...c, pinned: nextPinned };
      })
    );
  };

  const handleCopyClip = async (clip: ClipItem) => {
    const textToCopy =
      clip.category === 'image' || clip.category === 'file'
        ? clip.extractedText || clip.cloudUrl
        : clip.content;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      }
    } catch {
      // Fallback handled silently
    }
    setCopiedClipId(clip.id);
    window.setTimeout(() => {
      setCopiedClipId((current) => (current === clip.id ? null : current));
    }, 2000);
  };

  const handleToggleSelectClip = (id: string) => {
    setSelectedIds((prev) => toggleSelection(prev, id));
  };

  const filteredClips = filterClips(clips, activeTab, searchQuery);

  const handleSelectAllVisible = () => {
    setSelectedIds((prev) => selectAllVisible(prev, filteredClips));
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleCopySelected = async () => {
    const payload = formatBatchCopyPayload(clips, selectedIds);
    if (!payload) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(payload);
      }
    } catch {
      // Fallback handled silently
    }
    setBatchCopied(true);
    window.setTimeout(() => {
      setBatchCopied(false);
    }, 2000);
  };

  const handleFocusComposer = () => {
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleChangeWorkspaceId = useCallback(
    (nextRawId: string) => {
      const resolved = resolveWorkspaceId(nextRawId);
      setWorkspaceId(resolved);
      syncedToFirestoreRef.current.clear();
      try {
        localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, resolved);
        const url = new URL(window.location.href);
        if (resolved === WORKSPACE_OWNER_ID) {
          url.searchParams.delete('workspace');
          url.searchParams.delete('sync');
        } else {
          url.searchParams.set('workspace', resolved);
        }
        window.history.replaceState({}, '', url.toString());
      } catch {
        // Ignore URL/storage error
      }
      syncWorkspaceAcrossDevices(true);
    },
    [syncWorkspaceAcrossDevices]
  );

  const handleSyncLocalClipboard = useCallback(
    async (
      manualText?: string
    ): Promise<{ syncedText: boolean; message: string }> => {
      let clipboardText = manualText ? manualText.trim() : '';
      if (!clipboardText) {
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            const read = await navigator.clipboard.readText();
            if (read && read.trim()) {
              clipboardText = read.trim();
            }
          }
        } catch {
          // Browser requires explicit paste permission or user gesture
        }
      }

      let createdNew = false;
      if (clipboardText) {
        const alreadyExists = clipsRef.current.some(
          (c) => (c.content || '').trim() === clipboardText
        );
        if (!alreadyExists) {
          const firstLine = clipboardText.split('\n')[0].slice(0, 48).trim();
          handleCreateTextClip(
            firstLine || 'Mobile Clipboard Sync',
            clipboardText,
            '7 days'
          );
          createdNew = true;
        }
      }

      syncWorkspaceAcrossDevices(true).catch(() => {});

      if (createdNew) {
        return {
          syncedText: true,
          message: `Synced local clipboard text to workspace "${workspaceId}"`,
        };
      }
      return {
        syncedText: false,
        message: `Synced cloud clips for workspace "${workspaceId}"`,
      };
    },
    [handleCreateTextClip, syncWorkspaceAcrossDevices, workspaceId]
  );

  // When a mobile user scans the QR code (?workspace=<id>&sync=1), auto-sync immediately
  useEffect(() => {
    const parsed = parseWorkspaceFromSearch(window.location.search);
    if (parsed.autoSyncClipboard) {
      handleSyncLocalClipboard().catch(() => {});
    }
  }, [handleSyncLocalClipboard]);

  const metrics = calculateStorageMetrics(clips);
  const inspectedClip = clips.find((c) => c.id === inspectedClipId) || null;

  return (
    <div id="workspace-top" className="min-h-screen flex flex-col bg-stone-100 text-stone-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onFocusComposer={handleFocusComposer}
        activeUploadCount={metrics.activeUploadCount}
        isInstalled={isInstalled}
        onInstallClick={triggerInstall}
        workspaceId={workspaceId}
        onOpenQrModal={() => setIsQrModalOpen(true)}
      />

      <div className="flex-1 flex flex-col-reverse lg:flex-row max-w-[1440px] w-full mx-auto">
        <Sidebar
          clips={clips}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          speedProfile={speedProfile}
          onChangeSpeedProfile={setSpeedProfile}
          onClearAllClips={requestClearAllClips}
          isInstalled={isInstalled}
          onInstallClick={triggerInstall}
          workspaceId={workspaceId}
          onOpenQrModal={() => setIsQrModalOpen(true)}
        />

        <main className="flex-1 min-w-0 p-5 lg:p-6 space-y-5">
          <PasteComposer
            onCreateTextClip={handleCreateTextClip}
            onUploadFiles={handleUploadFiles}
            speedProfile={speedProfile}
            textareaRef={textareaRef}
          />

          <UploadQueuePanel
            clips={clips}
            speedProfile={speedProfile}
            onTogglePauseUpload={handleTogglePauseUpload}
            onCompleteUploadNow={handleCompleteUploadNow}
            onCancelUpload={requestDeleteClip}
          />

          <ClipStream
            clips={clips}
            filteredClips={filteredClips}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            searchQuery={searchQuery}
            onChangeSearchQuery={setSearchQuery}
            speedProfile={speedProfile}
            copiedClipId={copiedClipId}
            onCopyClip={handleCopyClip}
            onDownloadClip={(clip) => handleDownloadClip(clip, 'native')}
            onTogglePin={handleTogglePin}
            onDeleteClip={requestDeleteClip}
            onInspectClip={handleInspectClip}
            onClearSynced={requestClearSynced}
            onFocusComposer={handleFocusComposer}
            selectedIds={selectedIds}
            onToggleSelectClip={handleToggleSelectClip}
            onSelectAllVisible={handleSelectAllVisible}
            onClearSelection={handleClearSelection}
            onCopySelected={handleCopySelected}
            onDeleteSelected={requestDeleteSelected}
            batchCopied={batchCopied}
          />
        </main>
      </div>

      <ClipInspectorModal
        clip={inspectedClip}
        onClose={() => setInspectedClipId(null)}
        copiedClipId={copiedClipId}
        onCopyClip={handleCopyClip}
        onTogglePin={handleTogglePin}
        onDeleteClip={requestDeleteClip}
        onDownloadClip={handleDownloadClip}
        onRenameClip={handleRenameClip}
      />

      <DeletePasswordModal
        open={!!pendingDelete}
        targetLabel={pendingDelete?.label || ''}
        onConfirm={handleConfirmDeleteWithPassword}
        onCancel={() => setPendingDelete(null)}
      />

      <WorkspaceQrModal
        open={isQrModalOpen}
        workspaceId={workspaceId}
        onChangeWorkspaceId={handleChangeWorkspaceId}
        onSyncLocalClipboard={handleSyncLocalClipboard}
        onClose={() => setIsQrModalOpen(false)}
      />

      <PWAInstallModal
        open={showInstallSheet}
        isIOS={isIOS}
        onClose={() => setShowInstallSheet(false)}
      />

      <OfflineIndicator />
    </div>
  );
}
