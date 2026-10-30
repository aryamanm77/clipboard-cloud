import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  splitDataUrlIntoChunks,
  reassembleDataUrlFromChunks,
  sanitizeClipId,
  type ClipItem,
} from './utils/uploadEngine.ts';

const app = initializeApp(firebaseConfig);
setLogLevel('silent');
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const WORKSPACE_OWNER_ID = 'public-workspace';
export const DELETED_STORAGE_KEY = 'clipboard_deleted_ids_v3';

const pendingCreateMap = new Map<string, Promise<void>>();
const serverConfirmedClipIds = new Set<string>();
let isWriteQuotaExhausted = false;

const deletedFirestoreIds = new Set<string>(
  (() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(DELETED_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch {
      // Ignore storage access error
    }
    return [];
  })()
);

export function markClipConfirmedInFirestore(rawClipId: string): void {
  const clean = sanitizeClipId(rawClipId);
  serverConfirmedClipIds.add(rawClipId);
  serverConfirmedClipIds.add(clean);
}

export function markClipDeletedInFirestore(rawClipId: string): void {
  const clean = sanitizeClipId(rawClipId);
  deletedFirestoreIds.add(rawClipId);
  deletedFirestoreIds.add(clean);
  serverConfirmedClipIds.delete(rawClipId);
  serverConfirmedClipIds.delete(clean);
}

export function isClipDeletedInFirestore(rawClipId: string): boolean {
  const clean = sanitizeClipId(rawClipId);
  return deletedFirestoreIds.has(rawClipId) || deletedFirestoreIds.has(clean);
}

function isQuotaError(error: unknown): boolean {
  const rawMessage = error instanceof Error ? error.message : String(error);
  return (
    rawMessage.includes('resource-exhausted') ||
    rawMessage.includes('Quota limit exceeded')
  );
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  if (isQuotaError(error)) {
    isWriteQuotaExhausted = true;
    return;
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: rawMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

/**
 * Ensures a clip document actually exists on the Firestore server before attempting an updateDoc.
 * In Firestore, calling updateDoc on a non-existent document evaluates `allow update` with
 * `resource == null`, which fails with "Missing or insufficient permissions".
 */
async function ensureClipExistsOnServer(clipId: string): Promise<boolean> {
  if (isWriteQuotaExhausted || isClipDeletedInFirestore(clipId)) {
    return false;
  }
  if (serverConfirmedClipIds.has(clipId)) {
    return true;
  }
  try {
    const snap = await getDocFromServer(doc(db, 'clips', clipId));
    if (snap.exists() && !isClipDeletedInFirestore(clipId)) {
      serverConfirmedClipIds.add(clipId);
      return true;
    }
  } catch (error) {
    if (isQuotaError(error)) {
      isWriteQuotaExhausted = true;
    }
  }
  return false;
}

/**
 * Saves or updates a ClipItem and its binary chunks in Firestore while strictly adhering
 * to firebase-blueprint.json and firestore.rules constraints.
 */
export async function saveClipToFirestore(
  clip: ClipItem,
  userUid: string = WORKSPACE_OWNER_ID
): Promise<void> {
  const ownerId = userUid || WORKSPACE_OWNER_ID;
  const clipId = sanitizeClipId(clip.id);
  if (isWriteQuotaExhausted || isClipDeletedInFirestore(clipId)) {
    return;
  }
  const clipPath = `clips/${clipId}`;
  const clipRef = doc(db, 'clips', clipId);

  const task = (async () => {
    if (isWriteQuotaExhausted || isClipDeletedInFirestore(clipId)) return;

    const { inlineDataUrl, chunks } = splitDataUrlIntoChunks(clip.fileDataUrl);
    const safeContent =
      clip.content && clip.content.startsWith('data:')
        ? `${clip.title} (${clip.mimeType})`
        : (clip.content || clip.title || 'Clip').slice(0, 199000);
    const safeExtractedText = (clip.extractedText || '').slice(0, 199000);
    const safeTitle = (clip.title || 'Untitled').slice(0, 256);
    const safeMimeType = (clip.mimeType || 'application/octet-stream').slice(0, 128);
    const safeSizeBytes = Math.max(0, Math.min(52428800, Math.round(clip.sizeBytes || 0)));
    const safeProgress = Math.max(0, Math.min(100, Math.round(clip.progress || 0)));
    const safeUploadedBytes = Math.max(
      0,
      Math.min(52428800, Math.round(clip.uploadedBytes || 0))
    );
    const safeTotalDurationMs = Math.max(
      0,
      Math.min(600000, Math.round(clip.totalDurationMs || 4500))
    );
    const safeElapsedMs = Math.max(0, Math.min(600000, Math.round(clip.elapsedMs || 0)));
    const safeCreatedAtIso = (clip.createdAt || new Date().toISOString()).slice(0, 64);
    const safeRegion = (clip.region || 'Cloud').slice(0, 64);
    const safeSha256 = (clip.sha256 || 'sha256:00000000').slice(0, 128);
    const safeCloudUrl = (clip.cloudUrl || `https://cloud.clipboard.app/c/${clipId}`).slice(
      0,
      512
    );
    const safeTtlLabel = (clip.ttlLabel || '7 days').slice(0, 64);
    const safeDeviceSource = (clip.deviceSource || 'Web App').slice(0, 64);
    const safeFileExtension = (clip.fileExtension || '').slice(0, 32);

    let existsAlready = false;
    let existingData: Record<string, unknown> | undefined;
    try {
      const snap = await getDocFromServer(clipRef);
      existsAlready = snap.exists();
      if (existsAlready) {
        serverConfirmedClipIds.add(clipId);
        existingData = snap.data() as Record<string, unknown>;
      }
    } catch (error) {
      if (isQuotaError(error)) {
        isWriteQuotaExhausted = true;
        return;
      }
      try {
        const fallbackSnap = await getDoc(clipRef);
        existsAlready = fallbackSnap.exists();
        if (existsAlready) {
          existingData = fallbackSnap.data() as Record<string, unknown>;
        }
      } catch (innerErr) {
        handleFirestoreError(innerErr, OperationType.GET, clipPath);
        return;
      }
    }

    if (isWriteQuotaExhausted || isClipDeletedInFirestore(clipId)) return;

    if (!existsAlready) {
      try {
        await setDoc(clipRef, {
          id: clipId,
          ownerId,
          title: safeTitle,
          category: clip.category,
          content: safeContent,
          extractedText: safeExtractedText,
          mimeType: safeMimeType,
          sizeBytes: safeSizeBytes,
          createdAtIso: safeCreatedAtIso,
          status: clip.status,
          progress: safeProgress,
          uploadedBytes: safeUploadedBytes,
          totalDurationMs: safeTotalDurationMs,
          elapsedMs: safeElapsedMs,
          region: safeRegion,
          sha256: safeSha256,
          cloudUrl: safeCloudUrl,
          pinned: Boolean(clip.pinned),
          ttlLabel: safeTtlLabel,
          deviceSource: safeDeviceSource,
          fileExtension: safeFileExtension,
          chunkCount: Math.min(199, chunks.length),
          inlineDataUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        serverConfirmedClipIds.add(clipId);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, clipPath);
        return;
      }

      if (
        chunks.length > 0 &&
        chunks.length < 200 &&
        !isWriteQuotaExhausted &&
        !isClipDeletedInFirestore(clipId)
      ) {
        await Promise.all(
          chunks.map(async (chunkData, i) => {
            if (isWriteQuotaExhausted || isClipDeletedInFirestore(clipId)) return;
            const chunkId = `chunk_${String(i).padStart(4, '0')}`;
            const chunkPath = `clips/${clipId}/chunks/${chunkId}`;
            const chunkRef = doc(db, 'clips', clipId, 'chunks', chunkId);
            try {
              const existingChunk = await getDoc(chunkRef);
              if (existingChunk.exists()) return;
              if (isWriteQuotaExhausted || isClipDeletedInFirestore(clipId)) return;
              await setDoc(chunkRef, {
                clipId,
                ownerId,
                index: i,
                data: chunkData,
                createdAt: serverTimestamp(),
              });
            } catch (error) {
              handleFirestoreError(error, OperationType.CREATE, chunkPath);
            }
          })
        );
      }
    } else {
      const existingProgress =
        typeof existingData?.progress === 'number' ? existingData.progress : 0;
      const existingElapsed =
        typeof existingData?.elapsedMs === 'number' ? existingData.elapsedMs : 0;
      const existingUploaded =
        typeof existingData?.uploadedBytes === 'number' ? existingData.uploadedBytes : 0;
      const isAlreadySynced =
        existingData?.status === 'synced' ||
        clip.status === 'synced' ||
        existingProgress >= 100 ||
        safeProgress >= 100;

      try {
        await updateDoc(clipRef, {
          title: safeTitle,
          content: safeContent,
          extractedText: safeExtractedText,
          status: isAlreadySynced ? 'synced' : clip.status,
          progress: isAlreadySynced ? 100 : Math.max(existingProgress, safeProgress),
          uploadedBytes: isAlreadySynced
            ? safeSizeBytes
            : Math.max(existingUploaded, safeUploadedBytes),
          elapsedMs: isAlreadySynced
            ? safeTotalDurationMs
            : Math.max(existingElapsed, safeElapsedMs),
          pinned: Boolean(clip.pinned),
          fileExtension: safeFileExtension,
          chunkCount: Math.min(199, chunks.length),
          inlineDataUrl,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        if (isQuotaError(error)) {
          isWriteQuotaExhausted = true;
          return;
        }
        const stillExists = await ensureClipExistsOnServer(clipId);
        if (!stillExists) return;
        handleFirestoreError(error, OperationType.UPDATE, clipPath);
      }
    }
  })();

  pendingCreateMap.set(clipId, task);
  try {
    await task;
  } finally {
    if (pendingCreateMap.get(clipId) === task) {
      pendingCreateMap.delete(clipId);
    }
  }
}

export async function updateClipStatusInFirestore(
  rawClipId: string,
  status: ClipItem['status'],
  progress: number,
  uploadedBytes: number,
  elapsedMs: number
): Promise<void> {
  const clipId = sanitizeClipId(rawClipId);
  if (isWriteQuotaExhausted || isClipDeletedInFirestore(clipId)) return;
  const pending = pendingCreateMap.get(clipId);
  if (pending) {
    await pending.catch(() => {});
  }
  const existsOnServer = await ensureClipExistsOnServer(clipId);
  if (!existsOnServer) return;

  const clipPath = `clips/${clipId}`;
  try {
    await updateDoc(doc(db, 'clips', clipId), {
      status,
      progress: Math.max(0, Math.min(100, Math.round(progress))),
      uploadedBytes: Math.max(0, Math.min(52428800, Math.round(uploadedBytes))),
      elapsedMs: Math.max(0, Math.min(600000, Math.round(elapsedMs))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isQuotaError(error)) {
      isWriteQuotaExhausted = true;
      return;
    }
    serverConfirmedClipIds.delete(clipId);
    const stillExists = await ensureClipExistsOnServer(clipId);
    if (!stillExists) return;
    handleFirestoreError(error, OperationType.UPDATE, clipPath);
  }
}

export async function updateClipPinInFirestore(
  rawClipId: string,
  pinned: boolean
): Promise<void> {
  const clipId = sanitizeClipId(rawClipId);
  if (isWriteQuotaExhausted || isClipDeletedInFirestore(clipId)) return;
  const pending = pendingCreateMap.get(clipId);
  if (pending) {
    await pending.catch(() => {});
  }
  const existsOnServer = await ensureClipExistsOnServer(clipId);
  if (!existsOnServer) return;

  const clipPath = `clips/${clipId}`;
  try {
    await updateDoc(doc(db, 'clips', clipId), {
      pinned: Boolean(pinned),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isQuotaError(error)) {
      isWriteQuotaExhausted = true;
      return;
    }
    serverConfirmedClipIds.delete(clipId);
    const stillExists = await ensureClipExistsOnServer(clipId);
    if (!stillExists) return;
    handleFirestoreError(error, OperationType.UPDATE, clipPath);
  }
}

export async function updateClipTitleInFirestore(
  rawClipId: string,
  title: string,
  fileExtension: string = ''
): Promise<void> {
  const clipId = sanitizeClipId(rawClipId);
  if (isWriteQuotaExhausted || isClipDeletedInFirestore(clipId)) return;
  const pending = pendingCreateMap.get(clipId);
  if (pending) {
    await pending.catch(() => {});
  }
  const existsOnServer = await ensureClipExistsOnServer(clipId);
  if (!existsOnServer) return;

  const clipPath = `clips/${clipId}`;
  try {
    await updateDoc(doc(db, 'clips', clipId), {
      title: (title || 'Untitled').slice(0, 256),
      fileExtension: (fileExtension || '').slice(0, 32),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isQuotaError(error)) {
      isWriteQuotaExhausted = true;
      return;
    }
    serverConfirmedClipIds.delete(clipId);
    const stillExists = await ensureClipExistsOnServer(clipId);
    if (!stillExists) return;
    handleFirestoreError(error, OperationType.UPDATE, clipPath);
  }
}

export async function loadClipChunksFromFirestore(
  rawClipId: string,
  userUid: string = WORKSPACE_OWNER_ID
): Promise<string | undefined> {
  const ownerId = userUid || WORKSPACE_OWNER_ID;
  const clipId = sanitizeClipId(rawClipId);
  if (isClipDeletedInFirestore(clipId)) return undefined;
  const chunksPath = `clips/${clipId}/chunks`;
  try {
    const q = query(
      collection(db, 'clips', clipId, 'chunks'),
      where('ownerId', '==', ownerId)
    );
    const snap = await getDocs(q);
    if (snap.empty) return undefined;
    const chunkList: { index: number; data: string }[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (typeof data.index === 'number' && typeof data.data === 'string') {
        chunkList.push({ index: data.index, data: data.data });
      }
    });
    return reassembleDataUrlFromChunks('', chunkList);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, chunksPath);
  }
}

export async function deleteClipFromFirestore(
  rawClipId: string,
  userUid: string = WORKSPACE_OWNER_ID
): Promise<void> {
  const ownerId = userUid || WORKSPACE_OWNER_ID;
  const clipId = sanitizeClipId(rawClipId);
  markClipDeletedInFirestore(clipId);
  if (isWriteQuotaExhausted) return;

  const pending = pendingCreateMap.get(clipId);
  if (pending) {
    await pending.catch(() => {});
  }

  const clipPath = `clips/${clipId}`;
  const chunksPath = `clips/${clipId}/chunks`;

  await Promise.all([
    (async () => {
      try {
        await deleteDoc(doc(db, 'clips', clipId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, clipPath);
      }
    })(),
    (async () => {
      try {
        const q = query(
          collection(db, 'clips', clipId, 'chunks'),
          where('ownerId', '==', ownerId)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          await Promise.all(
            snap.docs.map((chunkDoc) =>
              deleteDoc(doc(db, 'clips', clipId, 'chunks', chunkDoc.id))
            )
          );
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, chunksPath);
      }
    })(),
  ]);
}

