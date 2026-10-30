export type ClipCategory = 'text' | 'code' | 'image' | 'file';

export type UploadStatus = 'uploading' | 'paused' | 'synced' | 'failed';

export type SyncSpeedProfileId = 'standard' | 'deep_replication' | 'throttled_link';

export interface SyncSpeedProfile {
  id: SyncSpeedProfileId;
  label: string;
  description: string;
  targetDurationMs: number;
  nominalSpeedKbps: number;
  regionLabel: string;
}

export interface ClipItem {
  id: string;
  title: string;
  category: ClipCategory;
  content: string; // Raw text, code snippet, image data URL, or file summary
  fileDataUrl?: string; // Full binary data URL for uploaded PDFs, Word docs, images, and files
  extractedText?: string; // Extracted readable document text for Word/PDF files
  mimeType: string;
  sizeBytes: number;
  createdAt: string; // ISO timestamp
  status: UploadStatus;
  progress: number; // 0 to 100
  uploadedBytes: number;
  totalDurationMs: number;
  elapsedMs: number;
  region: string;
  sha256: string;
  cloudUrl: string;
  pinned: boolean;
  ttlLabel: string;
  deviceSource: string;
  dimensions?: string;
  fileExtension?: string;
}

export const SYNC_SPEED_PROFILES: Record<SyncSpeedProfileId, SyncSpeedProfile> = {
  standard: {
    id: 'standard',
    label: 'Fast (4.5s)',
    description: 'Standard cloud upload',
    targetDurationMs: 4500,
    nominalSpeedKbps: 640,
    regionLabel: 'Cloud',
  },
  deep_replication: {
    id: 'deep_replication',
    label: 'Normal (8s)',
    description: 'Backed up in two regions',
    targetDurationMs: 8000,
    nominalSpeedKbps: 380,
    regionLabel: 'Cloud',
  },
  throttled_link: {
    id: 'throttled_link',
    label: 'Slow (12s)',
    description: 'Slow connection simulation',
    targetDurationMs: 12000,
    nominalSpeedKbps: 180,
    regionLabel: 'Cloud',
  },
};

export interface UploadStageInfo {
  stageName: string;
  chunkCurrent: number;
  chunkTotal: number;
  etaSeconds: number;
  speedFormatted: string;
}

/**
 * Classifies pasted or uploaded content into 'text', 'code', 'image', or 'file'.
 */
export function detectClipCategory(
  content: string,
  mimeType: string = 'text/plain',
  fileName?: string
): ClipCategory {
  const normalizedMime = mimeType.toLowerCase().trim();
  if (normalizedMime.startsWith('image/')) {
    return 'image';
  }

  if (fileName) {
    const lowerName = fileName.toLowerCase().trim();
    if (/\.(png|jpg|jpeg|gif|webp|svg|bmp|avif)$/.test(lowerName)) {
      return 'image';
    }
    if (/\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|cs|json|yaml|yml|toml|sql|sh|css|html)$/.test(lowerName)) {
      return 'code';
    }
    if (/\.(pdf|zip|tar|gz|tgz|rar|7z|doc|docx|rtf|odt|xls|xlsx|ppt|pptx|bin|iso|dmg|exe|apk|mp3|mp4|wav|mov)$/.test(lowerName)) {
      return 'file';
    }
  }

  if (
    normalizedMime &&
    normalizedMime !== 'text/plain' &&
    normalizedMime !== 'text/markdown' &&
    !normalizedMime.startsWith('text/')
  ) {
    return 'file';
  }

  const trimmed = content.trim();
  const codeSignals = [
    /^(import|export|const|let|var|function|class|interface|type)\s+/m,
    /^\s*(def|class|from|import)\s+\w+/m,
    /=>\s*\{/,
    /SELECT\s+.+\s+FROM\s+/i,
    /^\{[\s\S]*":[\s\S]*\}$/,
    /<\/?[a-z][\s\S]*>/i,
  ];
  let matchedSignals = 0;
  for (const regex of codeSignals) {
    if (regex.test(trimmed)) {
      matchedSignals += 1;
    }
  }
  if (matchedSignals >= 1 && (trimmed.includes('\n') || trimmed.includes(';') || trimmed.includes('{'))) {
    return 'code';
  }

  return 'text';
}

/**
 * Resolves a user-provided custom name with the original file's extension so renaming
 * a file (e.g., customName="Q4 Report", original="scan.pdf") preserves ".pdf" -> "Q4 Report.pdf".
 */
export function resolveUploadFileName(customName: string, originalFileName: string): string {
  const trimmedCustom = customName.trim();
  const trimmedOriginal = originalFileName.trim();

  if (!trimmedCustom) {
    return trimmedOriginal || 'Untitled_File';
  }

  const lastDotIndex = trimmedOriginal.lastIndexOf('.');
  if (lastDotIndex > 0 && lastDotIndex < trimmedOriginal.length - 1) {
    const extWithDot = trimmedOriginal.slice(lastDotIndex);
    if (!trimmedCustom.toLowerCase().endsWith(extWithDot.toLowerCase())) {
      return `${trimmedCustom}${extWithDot}`;
    }
  }

  return trimmedCustom;
}

/**
 * Checks whether a clip represents a PDF document.
 */
export function isPdfClip(
  clip: Pick<ClipItem, 'mimeType' | 'title' | 'fileExtension'>
): boolean {
  const mime = (clip.mimeType || '').toLowerCase();
  const ext = (clip.fileExtension || '').toUpperCase();
  const title = (clip.title || '').toLowerCase().trim();
  return mime === 'application/pdf' || mime.includes('pdf') || ext === 'PDF' || title.endsWith('.pdf');
}

/**
 * Checks whether a clip represents a Microsoft Word document (.docx or .doc).
 */
export function isWordClip(
  clip: Pick<ClipItem, 'mimeType' | 'title' | 'fileExtension'>
): boolean {
  const mime = (clip.mimeType || '').toLowerCase();
  const ext = (clip.fileExtension || '').toUpperCase();
  const title = (clip.title || '').toLowerCase().trim();
  return (
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    mime.includes('officedocument.word') ||
    ext === 'DOCX' ||
    ext === 'DOC' ||
    title.endsWith('.docx') ||
    title.endsWith('.doc')
  );
}

export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DOC_MIME_TYPE = 'application/msword';

/**
 * Decodes a data URL (`data:application/pdf;base64,...`) into a binary Uint8Array and MIME type.
 */
export function dataUrlToUint8Array(
  dataUrl: string
): { bytes: Uint8Array; mimeType: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;

  const header = dataUrl.slice(5, commaIdx);
  const dataPart = dataUrl.slice(commaIdx + 1);
  const parts = header.split(';');
  const mimeType = parts[0] || 'application/octet-stream';
  const isBase64 = parts.includes('base64');

  try {
    if (isBase64) {
      const cleanBase64 = dataPart.replace(/\s/g, '');
      if (typeof atob === 'function') {
        const binaryStr = atob(cleanBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return { bytes, mimeType };
      }
    } else {
      const decoded = decodeURIComponent(dataPart);
      const encoder = new TextEncoder();
      return { bytes: encoder.encode(decoded), mimeType };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Encodes a binary Uint8Array into a base64 Data URL.
 */
export function uint8ArrayToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : '';
  return `data:${mimeType};base64,${base64}`;
}

function escapePdfText(str: string): string {
  return str
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Generates a standards-compliant, viewable PDF-1.4 binary document from a title and text body.
 */
export function generateValidPdfBytes(title: string, bodyText: string): Uint8Array {
  const safeTitle = escapePdfText(title || 'Clipboard Document').slice(0, 90);
  const rawLines = (bodyText || '').replace(/\r\n/g, '\n').split('\n');

  const wrappedLines: string[] = [];
  for (const line of rawLines) {
    if (line.length <= 86) {
      wrappedLines.push(line);
    } else {
      for (let i = 0; i < line.length; i += 86) {
        wrappedLines.push(line.slice(i, i + 86));
      }
    }
    if (wrappedLines.length >= 42) break;
  }

  const streamOps: string[] = [
    'BT',
    '/F1 16 Tf',
    '50 750 Td',
    `(${safeTitle}) Tj`,
    '/F1 10 Tf',
    '0 -26 Td',
  ];

  for (const line of wrappedLines) {
    streamOps.push(`(${escapePdfText(line)}) Tj`);
    streamOps.push('0 -15 Td');
  }
  streamOps.push('ET');

  const streamContent = streamOps.join('\n') + '\n';

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

function escapeXml(str: string): string {
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str: string): string {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Generates a standards-compliant OpenXML (.docx) ZIP binary package from a title and body text.
 * Opens cleanly in Microsoft Word, LibreOffice, Google Docs, and Apple Pages.
 */
export function generateValidDocxBytes(title: string, bodyText: string): Uint8Array {
  const encoder = new TextEncoder();
  const cleanTitle = (title || 'Document').replace(/\.(docx|doc)$/i, '').trim() || 'Document';
  const rawLines = (bodyText || cleanTitle).replace(/\r\n/g, '\n').split('\n');

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  const wordRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  const paragraphXmlParts: string[] = [];
  // Title heading paragraph
  paragraphXmlParts.push(
    `<w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">${escapeXml(
      cleanTitle
    )}</w:t></w:r></w:p>`
  );

  for (const line of rawLines) {
    paragraphXmlParts.push(
      `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escapeXml(
        line
      )}</w:t></w:r></w:p>`
    );
  }

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    paragraphXmlParts.join('') +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
    '</w:body>' +
    '</w:document>';

  const files: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(wordRelsXml) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
  ];

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = computeCrc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0, true); // General purpose bit flag
    lv.setUint16(8, 0, true); // Compression method: 0 (STORE)
    lv.setUint16(10, 0, true); // Last mod file time
    lv.setUint16(12, 0x21, true); // Last mod file date
    lv.setUint32(14, crc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central file header signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed to extract
    cv.setUint16(8, 0, true); // General purpose bit flag
    cv.setUint16(10, 0, true); // Compression method: 0 (STORE)
    cv.setUint16(12, 0, true); // Last mod file time
    cv.setUint16(14, 0x21, true); // Last mod file date
    cv.setUint32(16, crc, true); // CRC-32
    cv.setUint32(20, size, true); // Compressed size
    cv.setUint32(24, size, true); // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, file.data);
    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralDirSize = centralParts.reduce((acc, part) => acc + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // End of central dir signature
  ev.setUint16(4, 0, true); // Number of this disk
  ev.setUint16(6, 0, true); // Disk where central directory starts
  ev.setUint16(8, files.length, true); // Total entries on this disk
  ev.setUint16(10, files.length, true); // Total entries in central dir
  ev.setUint32(12, centralDirSize, true); // Size of central directory
  ev.setUint32(16, offset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // Comment length

  const totalSize = offset + centralDirSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of localParts) {
    output.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    output.set(part, pos);
    pos += part.length;
  }
  output.set(eocd, pos);

  return output;
}

/**
 * Parses Word XML (`word/document.xml`) into clean paragraphs of text.
 */
export function parseWordDocumentXml(xml: string): string {
  if (!xml) return '';
  const paragraphs: string[] = [];
  const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pInner = pMatch[1];
    const runs: string[] = [];
    const tRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(pInner)) !== null) {
      if (tMatch[0] === '<w:tab/>') {
        runs.push('\t');
      } else if (tMatch[0] === '<w:br/>') {
        runs.push('\n');
      } else if (tMatch[1] !== undefined) {
        runs.push(unescapeXml(tMatch[1]));
      }
    }
    const line = runs.join('').trim();
    if (line) {
      paragraphs.push(line);
    }
  }

  if (paragraphs.length > 0) {
    return paragraphs.join('\n');
  }

  // Fallback: extract any <w:t> tags even if not wrapped in <w:p>
  const fallbackRuns = Array.from(xml.matchAll(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g)).map((m) =>
    unescapeXml(m[1]).trim()
  );
  return fallbackRuns.filter(Boolean).join(' ');
}

function findZipEntry(
  bytes: Uint8Array,
  targetName: string
): { compressionMethod: number; compressedData: Uint8Array } | null {
  if (bytes.length < 30) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) return null;

  const decoder = new TextDecoder();

  // First try reading from End of Central Directory (handles streaming ZIPs with data descriptors)
  let eocdOffset = -1;
  const minEocdSearch = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minEocdSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset !== -1) {
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    let cdPos = view.getUint32(eocdOffset + 16, true);
    for (let e = 0; e < totalEntries && cdPos + 46 <= bytes.length; e++) {
      if (view.getUint32(cdPos, true) !== 0x02014b50) break;
      const compressionMethod = view.getUint16(cdPos + 10, true);
      const compressedSize = view.getUint32(cdPos + 20, true);
      const nameLen = view.getUint16(cdPos + 28, true);
      const extraLen = view.getUint16(cdPos + 30, true);
      const commentLen = view.getUint16(cdPos + 32, true);
      const localHeaderOffset = view.getUint32(cdPos + 42, true);

      const entryName = decoder.decode(bytes.subarray(cdPos + 46, cdPos + 46 + nameLen));
      if (entryName === targetName && localHeaderOffset + 30 <= bytes.length) {
        const localNameLen = view.getUint16(localHeaderOffset + 26, true);
        const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        if (dataStart + compressedSize <= bytes.length) {
          return {
            compressionMethod,
            compressedData: bytes.subarray(dataStart, dataStart + compressedSize),
          };
        }
      }
      cdPos += 46 + nameLen + extraLen + commentLen;
    }
  }

  // Fallback: walk local file headers sequentially
  let pos = 0;
  while (pos + 30 <= bytes.length) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x04034b50) break;
    const compressionMethod = view.getUint16(pos + 8, true);
    const compressedSize = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const headerEnd = pos + 30 + nameLen + extraLen;
    if (headerEnd > bytes.length) break;

    const entryName = decoder.decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
    const dataEnd = headerEnd + compressedSize;
    if (entryName === targetName && dataEnd <= bytes.length) {
      return {
        compressionMethod,
        compressedData: bytes.subarray(headerEnd, dataEnd),
      };
    }
    if (compressedSize === 0) break;
    pos = dataEnd;
  }

  return null;
}

/**
 * Synchronously extracts readable text from an uncompressed (STORE) .docx binary buffer.
 */
export function extractTextFromDocxBytesSync(bytes: Uint8Array): string | null {
  const entry = findZipEntry(bytes, 'word/document.xml');
  if (!entry) return null;
  if (entry.compressionMethod === 0) {
    const xml = new TextDecoder().decode(entry.compressedData);
    const parsed = parseWordDocumentXml(xml);
    return parsed || null;
  }
  return null;
}

/**
 * Asynchronously extracts readable text from any .docx binary buffer (supports both STORE and DEFLATE).
 */
export async function extractTextFromDocxBytes(bytes: Uint8Array): Promise<string | null> {
  const entry = findZipEntry(bytes, 'word/document.xml');
  if (!entry) return null;

  if (entry.compressionMethod === 0) {
    const xml = new TextDecoder().decode(entry.compressedData);
    return parseWordDocumentXml(xml) || null;
  }

  if (entry.compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      const copy = new Uint8Array(entry.compressedData.byteLength);
      copy.set(entry.compressedData);
      writer.write(copy).catch(() => {});
      writer.close().catch(() => {});

      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      let totalLen = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          totalLen += value.length;
        }
      }
      const inflated = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        inflated.set(chunk, offset);
        offset += chunk.length;
      }
      const xml = new TextDecoder().decode(inflated);
      return parseWordDocumentXml(xml) || null;
    } catch {
      return null;
    }
  }

  return null;
}

function isPkZipBuffer(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function isOle2DocBuffer(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  );
}

/**
 * Builds the binary payload, MIME type, and filename for downloading any clip.
 * Ensures PDFs and Word (.docx) documents are always genuine, viewable binary files.
 */
export function getClipDownloadPayload(
  clip: ClipItem,
  format: boolean | 'native' | 'pdf' | 'docx' = false
): { bytes: Uint8Array; mimeType: string; filename: string } {
  const rawTitle = (clip.title || 'clip').trim();
  const forcePdf = format === true || format === 'pdf';
  const forceDocx = format === 'docx';

  const isPdf = !forceDocx && (forcePdf || isPdfClip(clip));
  const isWord = !forcePdf && (forceDocx || isWordClip(clip));

  const dataUrlSource =
    clip.fileDataUrl && clip.fileDataUrl.startsWith('data:')
      ? clip.fileDataUrl
      : clip.content && clip.content.startsWith('data:')
        ? clip.content
        : null;

  const readableBody =
    clip.extractedText && clip.extractedText.trim()
      ? clip.extractedText
      : clip.content || clip.title;

  if (isPdf) {
    const pdfFilename = rawTitle.toLowerCase().endsWith('.pdf')
      ? rawTitle
      : `${rawTitle.replace(/\.[^/.]+$/, '') || rawTitle}.pdf`;

    if (dataUrlSource && !forcePdf) {
      const decoded = dataUrlToUint8Array(dataUrlSource);
      if (decoded && decoded.bytes.length >= 4) {
        const header = String.fromCharCode(
          decoded.bytes[0],
          decoded.bytes[1],
          decoded.bytes[2],
          decoded.bytes[3]
        );
        if (header === '%PDF') {
          return {
            bytes: decoded.bytes,
            mimeType: 'application/pdf',
            filename: pdfFilename,
          };
        }
      }
    }

    return {
      bytes: generateValidPdfBytes(clip.title, readableBody),
      mimeType: 'application/pdf',
      filename: pdfFilename,
    };
  }

  if (isWord) {
    const baseTitle = rawTitle.replace(/\.(docx|doc)$/i, '') || rawTitle || 'Document';
    if (dataUrlSource && !forceDocx) {
      const decoded = dataUrlToUint8Array(dataUrlSource);
      if (decoded && decoded.bytes.length >= 4) {
        if (isPkZipBuffer(decoded.bytes)) {
          return {
            bytes: decoded.bytes,
            mimeType: DOCX_MIME_TYPE,
            filename: `${baseTitle}.docx`,
          };
        }
        if (isOle2DocBuffer(decoded.bytes)) {
          return {
            bytes: decoded.bytes,
            mimeType: DOC_MIME_TYPE,
            filename: rawTitle.toLowerCase().endsWith('.doc') ? rawTitle : `${baseTitle}.doc`,
          };
        }
      }
    }

    // Fallback or text-to-DOCX conversion: generate a valid, viewable OpenXML .docx binary
    return {
      bytes: generateValidDocxBytes(clip.title, readableBody),
      mimeType: DOCX_MIME_TYPE,
      filename: `${baseTitle}.docx`,
    };
  }

  if (dataUrlSource) {
    const decoded = dataUrlToUint8Array(dataUrlSource);
    if (decoded) {
      let filename = rawTitle;
      if (!filename.includes('.') && clip.fileExtension) {
        filename = `${filename}.${clip.fileExtension.toLowerCase()}`;
      }
      return {
        bytes: decoded.bytes,
        mimeType: clip.mimeType || decoded.mimeType || 'application/octet-stream',
        filename,
      };
    }
  }

  const filename = rawTitle.includes('.') ? rawTitle : `${rawTitle}.txt`;
  return {
    bytes: new TextEncoder().encode(clip.content || ''),
    mimeType: 'text/plain;charset=utf-8',
    filename,
  };
}

/**
 * Extracts metadata and readable text lines from a PDF clip for reliable in-modal previewing.
 */
export function extractPdfPreviewInfo(clip: ClipItem): {
  version: string;
  pageCount: number;
  byteLength: number;
  filename: string;
  extractedLines: string[];
} {
  const payload = getClipDownloadPayload(clip, 'pdf');
  const sampleSlice = payload.bytes.slice(0, Math.min(payload.bytes.length, 65536));
  let ascii = '';
  for (let i = 0; i < sampleSlice.length; i++) {
    const code = sampleSlice[i];
    ascii += code >= 32 && code <= 126 ? String.fromCharCode(code) : '\n';
  }

  const versionMatch = ascii.match(/%PDF-(\d+\.\d+)/);
  const version = versionMatch ? `PDF ${versionMatch[1]}` : 'PDF 1.4';

  const pageMatches = ascii.match(/\/Type\s*\/Page\b/g);
  const pageCount = Math.max(1, pageMatches ? pageMatches.length : 1);

  const tjMatches = Array.from(ascii.matchAll(/\(([^()]{2,120})\)\s*Tj/g)).map((m) =>
    m[1].replace(/\\([()\\])/g, '$1').trim()
  );

  const extractedLines =
    clip.extractedText && clip.extractedText.trim()
      ? clip.extractedText.split('\n').filter(Boolean).slice(0, 14)
      : tjMatches.length > 0
        ? tjMatches.slice(0, 14)
        : [clip.title, clip.content || 'Binary PDF document ready for download.'];

  return {
    version,
    pageCount,
    byteLength: payload.bytes.length,
    filename: payload.filename,
    extractedLines,
  };
}

/**
 * Extracts metadata and readable paragraphs from a Word (.docx/.doc) clip for in-modal previewing.
 */
export function extractWordPreviewInfo(clip: ClipItem): {
  formatLabel: string;
  filename: string;
  byteLength: number;
  paragraphCount: number;
  paragraphs: string[];
} {
  const payload = getClipDownloadPayload(clip);
  let text = clip.extractedText?.trim() || '';

  if (!text) {
    const syncExtracted = extractTextFromDocxBytesSync(payload.bytes);
    if (syncExtracted) {
      text = syncExtracted;
    }
  }

  if (!text && clip.content && !clip.content.startsWith('data:')) {
    text = clip.content;
  }

  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const finalParagraphs =
    paragraphs.length > 0
      ? paragraphs
      : [clip.title, 'Microsoft Word OpenXML document ready to view and download.'];

  return {
    formatLabel: payload.filename.toLowerCase().endsWith('.doc') ? 'DOC' : 'DOCX',
    filename: payload.filename,
    byteLength: payload.bytes.length,
    paragraphCount: finalParagraphs.length,
    paragraphs: finalParagraphs,
  };
}

/**
 * Formats byte counts with tabular precision (e.g. "2.4 MB", "840 B", "14.2 KB").
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * Computes deterministic SHA-256-like hex digest preview from input string.
 */
export function computeDeterministicHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const part3 = ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0');
  return `sha256:${part1}${part2}${part3}`;
}

/**
 * Calculates the detailed cloud upload stage, chunk index, ETA, and speed string.
 */
export function getUploadStageInfo(
  clip: Pick<ClipItem, 'progress' | 'sizeBytes' | 'totalDurationMs' | 'elapsedMs' | 'status'>,
  profileId: SyncSpeedProfileId = 'standard'
): UploadStageInfo {
  const clampedProgress = Math.max(0, Math.min(100, clip.progress));
  const chunkTotal = Math.max(4, Math.min(16, Math.ceil(clip.sizeBytes / (64 * 1024)) + 3));
  const chunkCurrent = Math.min(
    chunkTotal,
    Math.max(1, Math.ceil((clampedProgress / 100) * chunkTotal))
  );

  if (clip.status === 'synced' || clampedProgress >= 100) {
    return {
      stageName: 'Synced to Cloud',
      chunkCurrent: chunkTotal,
      chunkTotal,
      etaSeconds: 0,
      speedFormatted: '0 KB/s',
    };
  }

  if (clip.status === 'paused') {
    const remainingMs = Math.max(0, clip.totalDurationMs - clip.elapsedMs);
    return {
      stageName: 'Paused',
      chunkCurrent,
      chunkTotal,
      etaSeconds: Number((remainingMs / 1000).toFixed(1)),
      speedFormatted: 'Paused',
    };
  }

  if (clip.status === 'failed') {
    return {
      stageName: 'Upload failed',
      chunkCurrent,
      chunkTotal,
      etaSeconds: 0,
      speedFormatted: '0 KB/s',
    };
  }

  let stageName = 'Uploading to cloud';
  if (clampedProgress < 18) {
    stageName = 'Preparing file';
  } else if (clampedProgress < 82) {
    stageName = `Uploading chunk ${chunkCurrent} of ${chunkTotal}`;
  } else {
    stageName = 'Finishing upload';
  }

  const remainingFraction = (100 - clampedProgress) / 100;
  const remainingMs = Math.max(100, clip.totalDurationMs * remainingFraction);
  const etaSeconds = Number((remainingMs / 1000).toFixed(1));

  const profile = SYNC_SPEED_PROFILES[profileId] || SYNC_SPEED_PROFILES.standard;
  const speedFormatted = `${profile.nominalSpeedKbps} KB/s`;

  return {
    stageName,
    chunkCurrent,
    chunkTotal,
    etaSeconds,
    speedFormatted,
  };
}

/**
 * Normalizes an uploading clip using wall-clock time so stale 'uploading' snapshots
 * from storage or Firestore after a refresh complete cleanly instead of restarting at 0%.
 */
export function normalizeClipUploadState(
  clip: ClipItem,
  nowMs: number = Date.now()
): ClipItem {
  if (!clip || clip.status !== 'uploading') {
    return clip;
  }
  const totalDuration = Math.max(1000, clip.totalDurationMs || 4500);
  const createdMs = Date.parse(clip.createdAt || '') || 0;
  const wallElapsed = createdMs > 0 ? Math.max(0, nowMs - createdMs) : 0;
  const bestElapsed = Math.max(clip.elapsedMs || 0, wallElapsed);
  const computedProgress = Math.min(100, Math.round((bestElapsed / totalDuration) * 100));
  const bestProgress = Math.max(clip.progress || 0, computedProgress);

  if (bestProgress >= 100 || bestElapsed >= totalDuration) {
    return {
      ...clip,
      status: 'synced',
      progress: 100,
      elapsedMs: totalDuration,
      uploadedBytes: clip.sizeBytes,
    };
  }

  return {
    ...clip,
    progress: bestProgress,
    elapsedMs: bestElapsed,
    uploadedBytes: Math.min(
      clip.sizeBytes,
      Math.max(clip.uploadedBytes || 0, Math.round((bestProgress / 100) * clip.sizeBytes))
    ),
  };
}

/**
 * Advances an uploading clip by deltaMs and returns the updated ClipItem.
 * Strictly monotonic: progress and elapsedMs never decrease.
 */
export function advanceClipUpload(clip: ClipItem, deltaMs: number): ClipItem {
  if (clip.status !== 'uploading') {
    return clip;
  }
  const safeDelta = Math.max(0, deltaMs);
  const totalDuration = Math.max(1000, clip.totalDurationMs || 4500);
  const nextElapsed = Math.min(totalDuration, Math.max(0, clip.elapsedMs || 0) + safeDelta);
  const rawProgress = Math.min(100, Math.round((nextElapsed / totalDuration) * 100));
  const nextProgress = Math.max(clip.progress || 0, rawProgress);
  const nextUploadedBytes = Math.min(
    clip.sizeBytes,
    Math.max(clip.uploadedBytes || 0, Math.round((nextProgress / 100) * clip.sizeBytes))
  );

  if (nextProgress >= 100 || nextElapsed >= totalDuration) {
    return {
      ...clip,
      status: 'synced',
      progress: 100,
      elapsedMs: totalDuration,
      uploadedBytes: clip.sizeBytes,
    };
  }

  return {
    ...clip,
    progress: nextProgress,
    elapsedMs: nextElapsed,
    uploadedBytes: nextUploadedBytes,
  };
}

export type FilterTab = 'all' | 'text' | 'image' | 'file' | 'pinned' | 'uploading';

/**
 * Filters and searches clips based on active tab and query string.
 */
export function filterClips(
  clips: ClipItem[],
  activeTab: FilterTab,
  searchQuery: string
): ClipItem[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return clips.filter((clip) => {
    if (activeTab === 'text' && clip.category !== 'text' && clip.category !== 'code') {
      return false;
    }
    if (activeTab === 'image' && clip.category !== 'image') {
      return false;
    }
    if (activeTab === 'file' && clip.category !== 'file') {
      return false;
    }
    if (activeTab === 'pinned' && !clip.pinned) {
      return false;
    }
    if (activeTab === 'uploading' && clip.status !== 'uploading' && clip.status !== 'paused') {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchableText = [
      clip.title,
      clip.category,
      clip.mimeType,
      clip.region,
      clip.sha256,
      clip.deviceSource,
      clip.extractedText || '',
      clip.category === 'image' ? '' : clip.content,
    ]
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

/**
 * Computes aggregate cloud storage metrics.
 */
export function calculateStorageMetrics(clips: ClipItem[]) {
  const totalBytes = clips.reduce((acc, item) => acc + item.sizeBytes, 0);
  const syncedCount = clips.filter((item) => item.status === 'synced').length;
  const activeUploadCount = clips.filter(
    (item) => item.status === 'uploading' || item.status === 'paused'
  ).length;
  const quotaBytes = 50 * 1024 * 1024; // 50 MB workspace tier
  const usagePercent = Math.min(100, Number(((totalBytes / quotaBytes) * 100).toFixed(1)));

  return {
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    quotaFormatted: '50.0 MB',
    usagePercent,
    syncedCount,
    activeUploadCount,
  };
}

export const DELETE_PASSCODE = '3585';

/**
 * Verifies whether the provided password matches the required 3585 delete passcode.
 */
export function verifyDeletePassword(input: string): boolean {
  if (typeof input !== 'string') return false;
  return input.trim() === DELETE_PASSCODE;
}

/**
 * Toggles a single clip ID in the selected IDs list.
 */
export function toggleSelection(selectedIds: string[], id: string): string[] {
  if (selectedIds.includes(id)) {
    return selectedIds.filter((item) => item !== id);
  }
  return [...selectedIds, id];
}

/**
 * Selects all visible clips if not all are selected; otherwise deselects all visible clips.
 */
export function selectAllVisible(selectedIds: string[], visibleClips: ClipItem[]): string[] {
  const visibleIds = visibleClips.map((c) => c.id);
  if (visibleIds.length === 0) return selectedIds;

  const allVisibleSelected = visibleIds.every((id) => selectedIds.includes(id));
  if (allVisibleSelected) {
    return selectedIds.filter((id) => !visibleIds.includes(id));
  }

  const merged = new Set([...selectedIds, ...visibleIds]);
  return Array.from(merged);
}

/**
 * Formats multiple selected clips into a single text payload for 'Copy Selected'.
 */
export function formatBatchCopyPayload(clips: ClipItem[], selectedIds: string[]): string {
  const selectedClips = clips.filter((c) => selectedIds.includes(c.id));
  if (selectedClips.length === 0) return '';
  if (selectedClips.length === 1) {
    const single = selectedClips[0];
    return single.category === 'image' || single.category === 'file'
      ? single.extractedText || single.cloudUrl
      : single.content;
  }

  return selectedClips
    .map((clip) => {
      const body =
        clip.category === 'image' || clip.category === 'file'
          ? clip.extractedText || clip.cloudUrl
          : clip.content;
      return `--- ${clip.title} ---\n${body}`;
    })
    .join('\n\n');
}

export const CHUNK_MAX_CHARS = 300000;

/**
 * Splits a base64 data URL into either an inline string (if <= maxChunkSize)
 * or an array of sequential string chunks for Firestore subcollection storage.
 */
export function splitDataUrlIntoChunks(
  dataUrl?: string,
  maxChunkSize: number = CHUNK_MAX_CHARS
): { inlineDataUrl: string; chunks: string[] } {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return { inlineDataUrl: '', chunks: [] };
  }
  const safeLimit = Math.max(1024, Math.min(340000, maxChunkSize));
  if (dataUrl.length <= safeLimit) {
    return { inlineDataUrl: dataUrl, chunks: [] };
  }
  const chunks: string[] = [];
  for (let i = 0; i < dataUrl.length; i += safeLimit) {
    chunks.push(dataUrl.slice(i, i + safeLimit));
  }
  return { inlineDataUrl: '', chunks };
}

/**
 * Reassembles a full base64 data URL from either inlineDataUrl or indexed chunks.
 */
export function reassembleDataUrlFromChunks(
  inlineDataUrl?: string,
  chunks?: { index: number; data: string }[]
): string | undefined {
  if (inlineDataUrl && inlineDataUrl.length > 0) {
    return inlineDataUrl;
  }
  if (!chunks || chunks.length === 0) {
    return undefined;
  }
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  return sorted.map((c) => c.data).join('');
}

/**
 * Merges local clips and remote cloud clips across devices without dropping remote uploads.
 * Preserves binary fileDataUrl, extractedText, and synced progress state across devices.
 */
export function mergeClipsCrossDevice(
  localClips: ClipItem[],
  remoteClips: ClipItem[],
  deletedIds: Set<string> = new Set()
): ClipItem[] {
  const mergedMap = new Map<string, ClipItem>();
  const nowMs = Date.now();

  for (const rawRemote of remoteClips) {
    if (!rawRemote || !rawRemote.id || deletedIds.has(rawRemote.id)) continue;
    const remote = normalizeClipUploadState(rawRemote, nowMs);
    mergedMap.set(remote.id, { ...remote });
  }

  for (const rawLocal of localClips) {
    if (!rawLocal || !rawLocal.id || deletedIds.has(rawLocal.id)) continue;
    const local = normalizeClipUploadState(rawLocal, nowMs);
    const existingRemote = mergedMap.get(local.id);
    if (!existingRemote) {
      mergedMap.set(local.id, { ...local });
    } else {
      const totalDurationMs =
        Math.max(existingRemote.totalDurationMs || 0, local.totalDurationMs || 0) || 4500;
      const sizeBytes = Math.max(existingRemote.sizeBytes || 0, local.sizeBytes || 0);
      const bestElapsedMs = Math.max(existingRemote.elapsedMs || 0, local.elapsedMs || 0);
      const bestRawProgress = Math.max(existingRemote.progress || 0, local.progress || 0);
      const isSynced =
        existingRemote.status === 'synced' ||
        local.status === 'synced' ||
        bestRawProgress >= 100 ||
        bestElapsedMs >= totalDurationMs;
      const bestProgress = isSynced ? 100 : bestRawProgress;
      const bestFileDataUrl = local.fileDataUrl || existingRemote.fileDataUrl;
      const bestExtractedText = local.extractedText || existingRemote.extractedText;
      const bestContent =
        existingRemote.content &&
        !existingRemote.content.startsWith('data:') &&
        existingRemote.content.length >= (local.content || '').length
          ? existingRemote.content
          : local.content || existingRemote.content;

      mergedMap.set(local.id, {
        ...local,
        ...existingRemote,
        title: existingRemote.title || local.title,
        status: isSynced ? 'synced' : local.status || existingRemote.status,
        progress: bestProgress,
        totalDurationMs,
        elapsedMs: isSynced ? totalDurationMs : bestElapsedMs,
        uploadedBytes: isSynced
          ? sizeBytes
          : Math.max(existingRemote.uploadedBytes || 0, local.uploadedBytes || 0),
        fileDataUrl: bestFileDataUrl,
        extractedText: bestExtractedText,
        content: bestContent,
      });
    }
  }

  return Array.from(mergedMap.values()).sort((a, b) => {
    const timeA = Date.parse(a.createdAt || '') || 0;
    const timeB = Date.parse(b.createdAt || '') || 0;
    return timeB - timeA;
  });
}

/**
 * Enforces firebase-blueprint.json and firestore.rules schema bounds on a ClipItem.
 */
export function sanitizeClipId(rawId: string): string {
  const cleaned = (rawId || 'clip').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `clip-${Date.now()}`;
}

export const DEFAULT_WORKSPACE_ID = 'public-workspace';

/**
 * Sanitizes and resolves a workspace ID so it always conforms to Firestore's
 * `^[a-zA-Z0-9_-]{1,64}$` constraint, defaulting to `public-workspace`.
 */
export function resolveWorkspaceId(rawInput?: string | null): string {
  if (!rawInput || typeof rawInput !== 'string') {
    return DEFAULT_WORKSPACE_ID;
  }
  const cleaned = rawInput
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return cleaned || DEFAULT_WORKSPACE_ID;
}

/**
 * Builds the shareable cross-device URL encoded into the Workspace QR Code.
 */
export function buildWorkspaceSyncUrl(
  origin: string,
  workspaceId: string,
  autoSyncClipboard: boolean = true
): string {
  const safeOrigin = (origin || 'https://cloud.clipboard.app').replace(/\/+$/, '');
  const resolvedId = resolveWorkspaceId(workspaceId);
  const params = new URLSearchParams();
  params.set('workspace', resolvedId);
  if (autoSyncClipboard) {
    params.set('sync', '1');
  }
  return `${safeOrigin}/?${params.toString()}`;
}

/**
 * Parses `?workspace=<id>&sync=1` from a location.search string when a mobile user scans the QR code.
 */
export function parseWorkspaceFromSearch(search: string): {
  workspaceId: string | null;
  autoSyncClipboard: boolean;
} {
  if (!search || typeof search !== 'string') {
    return { workspaceId: null, autoSyncClipboard: false };
  }
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(normalized);
  const rawWorkspace = params.get('workspace');
  const syncParam = params.get('sync');
  return {
    workspaceId:
      rawWorkspace && rawWorkspace.trim() ? resolveWorkspaceId(rawWorkspace) : null,
    autoSyncClipboard: syncParam === '1' || syncParam === 'true',
  };
}

/**
 * Generates a human-friendly random workspace ID for quick mobile pairing.
 */
export function generateRandomWorkspaceId(): string {
  const part1 = Math.random().toString(36).slice(2, 6);
  const part2 = Math.random().toString(36).slice(2, 6);
  return resolveWorkspaceId(`ws-${part1}-${part2}`);
}


