import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectClipCategory,
  formatBytes,
  computeDeterministicHash,
  getUploadStageInfo,
  advanceClipUpload,
  filterClips,
  calculateStorageMetrics,
  resolveUploadFileName,
  isPdfClip,
  isWordClip,
  DOCX_MIME_TYPE,
  dataUrlToUint8Array,
  uint8ArrayToDataUrl,
  generateValidPdfBytes,
  generateValidDocxBytes,
  extractTextFromDocxBytesSync,
  extractTextFromDocxBytes,
  extractWordPreviewInfo,
  getClipDownloadPayload,
  verifyDeletePassword,
  toggleSelection,
  selectAllVisible,
  formatBatchCopyPayload,
  splitDataUrlIntoChunks,
  reassembleDataUrlFromChunks,
  mergeClipsCrossDevice,
  DEFAULT_WORKSPACE_ID,
  resolveWorkspaceId,
  buildWorkspaceSyncUrl,
  parseWorkspaceFromSearch,
  generateRandomWorkspaceId,
  type ClipItem,
} from './uploadEngine.ts';

const createSampleClip = (overrides: Partial<ClipItem> = {}): ClipItem => ({
  id: 'test-clip-1',
  title: 'Test Clip',
  category: 'text',
  content: 'Hello cloud clipboard',
  mimeType: 'text/plain',
  sizeBytes: 2048,
  createdAt: new Date().toISOString(),
  status: 'uploading',
  progress: 10,
  uploadedBytes: 204,
  totalDurationMs: 4000,
  elapsedMs: 400,
  region: 'Cloud',
  sha256: 'sha256:1234567890abcdef12345678',
  cloudUrl: 'https://cloud.clipboard.app/c/test-clip-1',
  pinned: false,
  ttlLabel: '24 hours',
  deviceSource: 'Test Suite',
  ...overrides,
});

test('detectClipCategory accurately classifies text, code, image, and file', () => {
  assert.equal(detectClipCategory('Just a simple note about groceries', 'text/plain'), 'text');
  assert.equal(
    detectClipCategory(
      'import React from "react";\nexport const App = () => {\n  return <div>Hello</div>;\n};',
      'text/plain'
    ),
    'code'
  );
  assert.equal(detectClipCategory('data:image/png;base64,iVBOR', 'image/png'), 'image');
  assert.equal(detectClipCategory('binary', 'application/pdf', 'report.pdf'), 'file');
  assert.equal(detectClipCategory('binary', DOCX_MIME_TYPE, 'proposal.docx'), 'file');
});

test('resolveUploadFileName preserves original file extension when user enters custom name', () => {
  assert.equal(resolveUploadFileName('Q4 Tax Invoice', 'scan_001.pdf'), 'Q4 Tax Invoice.pdf');
  assert.equal(resolveUploadFileName('Q4 Tax Invoice.pdf', 'scan_001.pdf'), 'Q4 Tax Invoice.pdf');
  assert.equal(resolveUploadFileName('Project Proposal', 'draft.docx'), 'Project Proposal.docx');
  assert.equal(resolveUploadFileName('   ', 'original.pdf'), 'original.pdf');
  assert.equal(resolveUploadFileName('Screenshot Hero', 'capture.png'), 'Screenshot Hero.png');
});

test('isPdfClip and dataUrlToUint8Array detect and decode PDF data URLs accurately', () => {
  const pdfClip = createSampleClip({
    title: 'Contract.pdf',
    category: 'file',
    mimeType: 'application/pdf',
    fileExtension: 'PDF',
  });
  assert.equal(isPdfClip(pdfClip), true);

  const textClip = createSampleClip({ title: 'Notes.txt', mimeType: 'text/plain' });
  assert.equal(isPdfClip(textClip), false);

  const samplePdfBytes = generateValidPdfBytes('Invoice 2026', 'Total Due: $1,250.00');
  const header = new TextDecoder().decode(samplePdfBytes.slice(0, 8));
  assert.equal(header.startsWith('%PDF-1.4'), true);

  const base64 = Buffer.from(samplePdfBytes).toString('base64');
  const dataUrl = `data:application/pdf;base64,${base64}`;
  const decoded = dataUrlToUint8Array(dataUrl);
  assert.ok(decoded);
  assert.equal(decoded.mimeType, 'application/pdf');
  assert.equal(decoded.bytes.length, samplePdfBytes.length);
});

test('getClipDownloadPayload returns original PDF binary or generates valid viewable PDF', () => {
  const originalPdfBytes = generateValidPdfBytes('Uploaded PDF', 'Original binary body');
  const dataUrl = `data:application/pdf;base64,${Buffer.from(originalPdfBytes).toString('base64')}`;

  const uploadedPdfClip = createSampleClip({
    title: 'My Named Document.pdf',
    category: 'file',
    mimeType: 'application/pdf',
    fileDataUrl: dataUrl,
  });

  const payload = getClipDownloadPayload(uploadedPdfClip);
  assert.equal(payload.mimeType, 'application/pdf');
  assert.equal(payload.filename, 'My Named Document.pdf');
  assert.equal(new TextDecoder().decode(payload.bytes.slice(0, 5)), '%PDF-');
  assert.equal(payload.bytes.length, originalPdfBytes.length);

  // Also test generating a viewable PDF from a plain text clip when forcePdf=true
  const textClip = createSampleClip({
    title: 'Meeting Summary',
    content: 'Action items for Q4 launch',
  });
  const convertedPdf = getClipDownloadPayload(textClip, true);
  assert.equal(convertedPdf.mimeType, 'application/pdf');
  assert.equal(convertedPdf.filename, 'Meeting Summary.pdf');
  assert.equal(new TextDecoder().decode(convertedPdf.bytes.slice(0, 8)), '%PDF-1.4');
});

test('isWordClip, generateValidDocxBytes, and extractTextFromDocxBytes round-trip cleanly', async () => {
  const wordClip = createSampleClip({
    title: 'Architecture Spec.docx',
    category: 'file',
    mimeType: DOCX_MIME_TYPE,
    fileExtension: 'DOCX',
  });
  assert.equal(isWordClip(wordClip), true);
  assert.equal(isWordClip(createSampleClip({ title: 'Notes.txt' })), false);

  const docxBytes = generateValidDocxBytes(
    'Quarterly Business Review',
    'Executive Summary: Revenue grew 28% YoY.\nNext Steps: Expand enterprise cloud tier.'
  );

  // Verify PK\x03\x04 ZIP local header signature
  assert.equal(docxBytes[0], 0x50); // 'P'
  assert.equal(docxBytes[1], 0x4b); // 'K'
  assert.equal(docxBytes[2], 0x03);
  assert.equal(docxBytes[3], 0x04);

  // Verify synchronous and asynchronous text extraction from .docx ZIP
  const syncText = extractTextFromDocxBytesSync(docxBytes);
  assert.ok(syncText);
  assert.equal(syncText.includes('Quarterly Business Review'), true);
  assert.equal(syncText.includes('Executive Summary: Revenue grew 28% YoY.'), true);
  assert.equal(syncText.includes('Next Steps: Expand enterprise cloud tier.'), true);

  const asyncText = await extractTextFromDocxBytes(docxBytes);
  assert.equal(asyncText, syncText);
});

test('getClipDownloadPayload and extractWordPreviewInfo guarantee valid viewable .docx files', () => {
  const originalDocxBytes = generateValidDocxBytes(
    'Client Contract',
    'Section 1: Scope of Work\nSection 2: Payment Terms'
  );
  const docxDataUrl = uint8ArrayToDataUrl(originalDocxBytes, DOCX_MIME_TYPE);

  // 1. Uploaded .docx with binary dataUrl preserves exact bytes and official MIME
  const uploadedWordClip = createSampleClip({
    title: 'Client Contract.docx',
    category: 'file',
    mimeType: DOCX_MIME_TYPE,
    fileDataUrl: docxDataUrl,
    fileExtension: 'DOCX',
  });

  const payload1 = getClipDownloadPayload(uploadedWordClip);
  assert.equal(payload1.mimeType, DOCX_MIME_TYPE);
  assert.equal(payload1.filename, 'Client Contract.docx');
  assert.equal(payload1.bytes.length, originalDocxBytes.length);
  assert.equal(payload1.bytes[0], 0x50);
  assert.equal(payload1.bytes[1], 0x4b);

  const previewInfo = extractWordPreviewInfo(uploadedWordClip);
  assert.equal(previewInfo.formatLabel, 'DOCX');
  assert.equal(previewInfo.filename, 'Client Contract.docx');
  assert.equal(
    previewInfo.paragraphs.some((p) => p.includes('Section 1: Scope of Work')),
    true
  );

  // 2. Word clip missing fileDataUrl (or created from text named .docx) still downloads a valid OpenXML .docx ZIP!
  const textNamedWordClip = createSampleClip({
    title: 'Handover Notes.docx',
    category: 'file',
    content: 'All deployment keys rotated and verified.',
    mimeType: 'application/octet-stream',
    fileExtension: 'DOCX',
  });

  const payload2 = getClipDownloadPayload(textNamedWordClip);
  assert.equal(payload2.mimeType, DOCX_MIME_TYPE);
  assert.equal(payload2.filename, 'Handover Notes.docx');
  assert.equal(payload2.bytes[0], 0x50); // Valid PK\x03\x04 ZIP!
  assert.equal(payload2.bytes[1], 0x4b);
  const extractedFromFallback = extractTextFromDocxBytesSync(payload2.bytes);
  assert.ok(extractedFromFallback);
  assert.equal(extractedFromFallback.includes('All deployment keys rotated and verified.'), true);
});

test('formatBytes formats byte sizes cleanly', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.00 MB');
});

test('computeDeterministicHash produces stable sha256 prefix', () => {
  const h1 = computeDeterministicHash('hello-world');
  const h2 = computeDeterministicHash('hello-world');
  const h3 = computeDeterministicHash('different-input');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.equal(h1.startsWith('sha256:'), true);
});

test('advanceClipUpload progresses uploading clip and transitions to synced at 100%', () => {
  const clip = createSampleClip({
    progress: 50,
    elapsedMs: 2000,
    totalDurationMs: 4000,
    sizeBytes: 1000,
  });

  const mid = advanceClipUpload(clip, 1000);
  assert.equal(mid.status, 'uploading');
  assert.equal(mid.progress, 75);
  assert.equal(mid.uploadedBytes, 750);

  const done = advanceClipUpload(mid, 1500);
  assert.equal(done.status, 'synced');
  assert.equal(done.progress, 100);
  assert.equal(done.uploadedBytes, 1000);
});

test('getUploadStageInfo returns accurate stage description and ETA', () => {
  const clip = createSampleClip({
    progress: 45,
    elapsedMs: 1800,
    totalDurationMs: 4000,
    status: 'uploading',
  });
  const info = getUploadStageInfo(clip, 'standard');
  assert.equal(info.stageName.startsWith('Uploading chunk'), true);
  assert.equal(info.etaSeconds > 0, true);

  const syncedClip = createSampleClip({ status: 'synced', progress: 100 });
  const syncedInfo = getUploadStageInfo(syncedClip, 'standard');
  assert.equal(syncedInfo.stageName, 'Synced to Cloud');
  assert.equal(syncedInfo.etaSeconds, 0);
});

test('filterClips filters by tab and search query including extractedText', () => {
  const clips: ClipItem[] = [
    createSampleClip({ id: '1', title: 'Alpha Snippet', category: 'code', pinned: true }),
    createSampleClip({ id: '2', title: 'Beta Image', category: 'image', pinned: false }),
    createSampleClip({
      id: '3',
      title: 'Gamma Word.docx',
      category: 'file',
      extractedText: 'Confidential board resolution paragraph',
      status: 'synced',
    }),
  ];

  assert.equal(filterClips(clips, 'all', '').length, 3);
  assert.equal(filterClips(clips, 'text', '').length, 1);
  assert.equal(filterClips(clips, 'image', '').length, 1);
  assert.equal(filterClips(clips, 'file', '').length, 1);
  assert.equal(filterClips(clips, 'pinned', '').length, 1);
  assert.equal(filterClips(clips, 'all', 'board resolution').length, 1);
});

test('calculateStorageMetrics sums bytes and counts active uploads', () => {
  const clips: ClipItem[] = [
    createSampleClip({ sizeBytes: 1024, status: 'synced' }),
    createSampleClip({ sizeBytes: 2048, status: 'uploading' }),
  ];
  const metrics = calculateStorageMetrics(clips);
  assert.equal(metrics.totalBytes, 3072);
  assert.equal(metrics.syncedCount, 1);
  assert.equal(metrics.activeUploadCount, 1);
});

test('verifyDeletePassword only accepts 3585', () => {
  assert.equal(verifyDeletePassword('3585'), true);
  assert.equal(verifyDeletePassword(' 3585 '), true);
  assert.equal(verifyDeletePassword('0000'), false);
  assert.equal(verifyDeletePassword(''), false);
});

test('toggleSelection, selectAllVisible, and formatBatchCopyPayload handle batch operations', () => {
  const c1 = createSampleClip({ id: 'c1', title: 'Note 1', content: 'First body' });
  const c2 = createSampleClip({ id: 'c2', title: 'Note 2', content: 'Second body' });
  const visible = [c1, c2];

  let selected: string[] = [];
  selected = toggleSelection(selected, 'c1');
  assert.deepEqual(selected, ['c1']);

  selected = selectAllVisible(selected, visible);
  assert.deepEqual(selected, ['c1', 'c2']);

  const payload = formatBatchCopyPayload(visible, selected);
  assert.equal(payload.includes('--- Note 1 ---'), true);
  assert.equal(payload.includes('Second body'), true);

  selected = selectAllVisible(selected, visible);
  assert.deepEqual(selected, []);
});

test('splitDataUrlIntoChunks and reassembleDataUrlFromChunks handle inline and multi-chunk binary payloads', () => {
  const smallUrl = 'data:text/plain;base64,SGVsbG8=';
  const smallSplit = splitDataUrlIntoChunks(smallUrl, 2048);
  assert.equal(smallSplit.inlineDataUrl, smallUrl);
  assert.equal(smallSplit.chunks.length, 0);
  assert.equal(reassembleDataUrlFromChunks(smallSplit.inlineDataUrl, []), smallUrl);

  const largePayload = 'data:application/pdf;base64,' + 'A'.repeat(5000);
  const largeSplit = splitDataUrlIntoChunks(largePayload, 1500);
  assert.equal(largeSplit.inlineDataUrl, '');
  assert.equal(largeSplit.chunks.length, 4);

  const shuffledChunks = largeSplit.chunks
    .map((data, index) => ({ index, data }))
    .reverse();
  const reassembled = reassembleDataUrlFromChunks('', shuffledChunks);
  assert.equal(reassembled, largePayload);
});

test('mergeClipsCrossDevice combines clips from different PCs without dropping remote uploads', () => {
  const pc1Clip = createSampleClip({
    id: 'clip-pc1',
    title: 'Uploaded_On_PC1.pdf',
    createdAt: '2026-10-30T10:00:00.000Z',
    fileDataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
    status: 'synced',
    progress: 100,
  });
  const pc2Clip = createSampleClip({
    id: 'clip-pc2',
    title: 'Local_Note_On_PC2.txt',
    createdAt: '2026-10-30T10:05:00.000Z',
    status: 'synced',
    progress: 100,
  });

  // PC2 has pc2Clip locally, and fetches pc1Clip from the cloud/server
  const merged = mergeClipsCrossDevice([pc2Clip], [pc1Clip]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'clip-pc2');
  assert.equal(merged[1].id, 'clip-pc1');
  assert.equal(merged[1].fileDataUrl, 'data:application/pdf;base64,JVBERi0xLjQ=');

  // Verify active upload progress and elapsedMs are never reset backwards by a stale remote snapshot
  const localUploading = createSampleClip({
    id: 'clip-active',
    status: 'uploading',
    progress: 60,
    elapsedMs: 2700,
    totalDurationMs: 4500,
    uploadedBytes: 600,
    sizeBytes: 1000,
  });
  const staleRemoteSnapshot = createSampleClip({
    id: 'clip-active',
    status: 'uploading',
    progress: 4,
    elapsedMs: 180,
    totalDurationMs: 4500,
    uploadedBytes: 40,
    sizeBytes: 1000,
  });
  const mergedActive = mergeClipsCrossDevice([localUploading], [staleRemoteSnapshot]);
  assert.equal(mergedActive[0].progress >= 60, true);
  assert.equal(mergedActive[0].elapsedMs >= 2700, true);
  assert.equal(mergedActive[0].uploadedBytes >= 600, true);

  // Verify deleted clips are strictly excluded even when present in both local and remote
  const deletedSet = new Set<string>(['clip-pc1', 'clip-active']);
  const afterDelete = mergeClipsCrossDevice(
    [pc1Clip, pc2Clip, localUploading],
    [pc1Clip, staleRemoteSnapshot],
    deletedSet
  );
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].id, 'clip-pc2');

  // Verify a stale remote clip created 10 seconds ago with status 'uploading' and progress 4% normalizes to synced (100%) instead of restarting from the beginning
  const tenSecondsAgoIso = new Date(Date.now() - 10000).toISOString();
  const stalePastRemote = createSampleClip({
    id: 'clip-past',
    createdAt: tenSecondsAgoIso,
    status: 'uploading',
    progress: 4,
    elapsedMs: 180,
    totalDurationMs: 4500,
    sizeBytes: 2048,
  });
  const mergedPast = mergeClipsCrossDevice([], [stalePastRemote]);
  assert.equal(mergedPast[0].status, 'synced');
  assert.equal(mergedPast[0].progress, 100);
  assert.equal(mergedPast[0].elapsedMs, 4500);
  assert.equal(mergedPast[0].uploadedBytes, 2048);
});

test('resolveWorkspaceId, buildWorkspaceSyncUrl, parseWorkspaceFromSearch, and generateRandomWorkspaceId support QR workspace syncing', () => {
  assert.equal(resolveWorkspaceId(''), DEFAULT_WORKSPACE_ID);
  assert.equal(resolveWorkspaceId('   '), DEFAULT_WORKSPACE_ID);
  assert.equal(resolveWorkspaceId('My Team Workspace!@#'), 'My-Team-Workspace');
  assert.equal(resolveWorkspaceId('ws-mobile_01'), 'ws-mobile_01');

  const syncUrl = buildWorkspaceSyncUrl('https://example.com/', 'ws-mobile_01', true);
  assert.equal(syncUrl, 'https://example.com/?workspace=ws-mobile_01&sync=1');

  const parsed1 = parseWorkspaceFromSearch('?workspace=ws-mobile_01&sync=1');
  assert.equal(parsed1.workspaceId, 'ws-mobile_01');
  assert.equal(parsed1.autoSyncClipboard, true);

  const parsed2 = parseWorkspaceFromSearch('?workspace=custom%20room');
  assert.equal(parsed2.workspaceId, 'custom-room');
  assert.equal(parsed2.autoSyncClipboard, false);

  const parsedEmpty = parseWorkspaceFromSearch('');
  assert.equal(parsedEmpty.workspaceId, null);
  assert.equal(parsedEmpty.autoSyncClipboard, false);

  const randomId = generateRandomWorkspaceId();
  assert.equal(randomId.startsWith('ws-'), true);
  assert.equal(resolveWorkspaceId(randomId), randomId);
});




