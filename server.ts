import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  verifyDeletePassword,
  getClipDownloadPayload,
  mergeClipsCrossDevice,
  normalizeClipUploadState,
  type ClipItem,
} from './src/utils/uploadEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE_PATH = path.join(__dirname, '.cloud-clips-store.json');

interface PersistedServerStore {
  clips: ClipItem[];
  deletedIds: string[];
}

function loadPersistedStore(): PersistedServerStore {
  try {
    if (fs.existsSync(STORE_FILE_PATH)) {
      const raw = fs.readFileSync(STORE_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        clips: Array.isArray(parsed?.clips) ? parsed.clips : [],
        deletedIds: Array.isArray(parsed?.deletedIds) ? parsed.deletedIds : [],
      };
    }
  } catch {
    // Ignore read error
  }
  return { clips: [], deletedIds: [] };
}

function savePersistedStore(clips: ClipItem[], deletedIds: Set<string>) {
  try {
    const payload: PersistedServerStore = {
      clips,
      deletedIds: Array.from(deletedIds).slice(-500),
    };
    fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(payload), 'utf8');
  } catch {
    // Ignore disk write error
  }
}

function normalizeUploadingClips(clips: ClipItem[], deletedIds: Set<string>): ClipItem[] {
  const now = Date.now();
  return clips
    .filter((c) => c && c.id && !deletedIds.has(c.id))
    .map((clip) => normalizeClipUploadState(clip, now));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  const initial = loadPersistedStore();
  const deletedClipIds = new Set<string>(initial.deletedIds);
  let cloudClipsStore: ClipItem[] = normalizeUploadingClips(initial.clips, deletedClipIds);

  app.get('/api/clips', (_req, res) => {
    cloudClipsStore = normalizeUploadingClips(cloudClipsStore, deletedClipIds);
    res.json({
      clips: cloudClipsStore,
      deletedIds: Array.from(deletedClipIds),
    });
  });

  app.get('/api/clips/:id', (req, res) => {
    if (deletedClipIds.has(req.params.id)) {
      res.status(404).json({ error: 'Clip not found' });
      return;
    }
    const clip = cloudClipsStore.find((c) => c.id === req.params.id);
    if (!clip) {
      res.status(404).json({ error: 'Clip not found' });
      return;
    }
    res.json({ clip: normalizeClipUploadState(clip) });
  });

  app.post('/api/clips/sync', (req, res) => {
    const clientClips: ClipItem[] = Array.isArray(req.body?.clips) ? req.body.clips : [];
    const clientDeletedIds: string[] = Array.isArray(req.body?.deletedIds)
      ? req.body.deletedIds
      : [];
    clientDeletedIds.forEach((id) => {
      if (typeof id === 'string' && id) {
        deletedClipIds.add(id);
      }
    });
    cloudClipsStore = normalizeUploadingClips(
      mergeClipsCrossDevice(clientClips, cloudClipsStore, deletedClipIds),
      deletedClipIds
    );
    savePersistedStore(cloudClipsStore, deletedClipIds);
    res.json({
      clips: cloudClipsStore,
      deletedIds: Array.from(deletedClipIds),
    });
  });

  app.post('/api/clips', (req, res) => {
    const newClip = req.body as ClipItem;
    if (!newClip || !newClip.id || !newClip.title) {
      res.status(400).json({ error: 'Invalid clip payload' });
      return;
    }
    deletedClipIds.delete(newClip.id);
    cloudClipsStore = mergeClipsCrossDevice([newClip], cloudClipsStore, deletedClipIds);
    savePersistedStore(cloudClipsStore, deletedClipIds);
    res.status(201).json({ clip: newClip });
  });

  app.get('/api/clips/:id/download', (req, res) => {
    const { id } = req.params;
    const forcePdf = req.query.pdf === '1';
    const inline = req.query.inline === '1';
    const clip = cloudClipsStore.find((c) => c.id === id);
    if (!clip) {
      res.status(404).json({ error: 'Clip not found' });
      return;
    }
    const payload = getClipDownloadPayload(clip, forcePdf);
    const safeFilename = payload.filename.replace(/["\\]/g, '_');
    res.setHeader('Content-Type', payload.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${safeFilename}"`
    );
    res.send(Buffer.from(payload.bytes));
  });

  app.patch('/api/clips/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body as Partial<ClipItem>;
    const index = cloudClipsStore.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Clip not found' });
      return;
    }
    cloudClipsStore[index] = {
      ...cloudClipsStore[index],
      ...updates,
      fileDataUrl: updates.fileDataUrl || cloudClipsStore[index].fileDataUrl,
    };
    savePersistedStore(cloudClipsStore, deletedClipIds);
    res.json({ clip: cloudClipsStore[index] });
  });

  app.delete('/api/clips/:id', (req, res) => {
    const headerPwd = (req.headers['x-delete-password'] as string) || req.body?.password || '';
    if (!verifyDeletePassword(headerPwd)) {
      res.status(403).json({ error: 'Invalid delete password' });
      return;
    }
    const { id } = req.params;
    deletedClipIds.add(id);
    cloudClipsStore = cloudClipsStore.filter((c) => c.id !== id);
    savePersistedStore(cloudClipsStore, deletedClipIds);
    res.json({ deletedId: id, deletedIds: Array.from(deletedClipIds) });
  });

  app.post('/api/clips/delete-batch', (req, res) => {
    const headerPwd = (req.headers['x-delete-password'] as string) || req.body?.password || '';
    if (!verifyDeletePassword(headerPwd)) {
      res.status(403).json({ error: 'Invalid delete password' });
      return;
    }
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const idSet = new Set(ids);
    ids.forEach((id) => deletedClipIds.add(id));
    cloudClipsStore = cloudClipsStore.filter((c) => !idSet.has(c.id));
    savePersistedStore(cloudClipsStore, deletedClipIds);
    res.json({ clips: cloudClipsStore, deletedIds: Array.from(deletedClipIds) });
  });

  app.post('/api/clips/clear-synced', (req, res) => {
    const headerPwd = (req.headers['x-delete-password'] as string) || req.body?.password || '';
    if (!verifyDeletePassword(headerPwd)) {
      res.status(403).json({ error: 'Invalid delete password' });
      return;
    }
    cloudClipsStore
      .filter((c) => !c.pinned && c.status === 'synced')
      .forEach((c) => deletedClipIds.add(c.id));
    cloudClipsStore = cloudClipsStore.filter((c) => c.pinned || c.status !== 'synced');
    savePersistedStore(cloudClipsStore, deletedClipIds);
    res.json({ clips: cloudClipsStore, deletedIds: Array.from(deletedClipIds) });
  });

  app.post('/api/clips/clear-all', (req, res) => {
    const headerPwd = (req.headers['x-delete-password'] as string) || req.body?.password || '';
    if (!verifyDeletePassword(headerPwd)) {
      res.status(403).json({ error: 'Invalid delete password' });
      return;
    }
    cloudClipsStore.forEach((c) => deletedClipIds.add(c.id));
    cloudClipsStore = [];
    savePersistedStore(cloudClipsStore, deletedClipIds);
    res.json({ clips: cloudClipsStore, deletedIds: Array.from(deletedClipIds) });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Clipboard cloud server running on http://localhost:${PORT}`);
  });
}

startServer();
