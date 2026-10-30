import React, { useEffect, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  CheckCircle2,
  CloudUpload,
  Bookmark,
  Trash2,
  FileText,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import {
  formatBytes,
  isPdfClip,
  isWordClip,
  dataUrlToUint8Array,
  extractTextFromDocxBytes,
  getClipDownloadPayload,
  extractPdfPreviewInfo,
  extractWordPreviewInfo,
  type ClipItem,
} from '../utils/uploadEngine.ts';

interface ClipInspectorModalProps {
  clip: ClipItem | null;
  onClose: () => void;
  copiedClipId: string | null;
  onCopyClip: (clip: ClipItem) => void;
  onTogglePin: (id: string) => void;
  onDeleteClip: (id: string) => void;
  onDownloadClip: (clip: ClipItem, format?: boolean | 'native' | 'pdf' | 'docx') => void;
  onRenameClip?: (id: string, newTitle: string) => void;
}

export const ClipInspectorModal: React.FC<ClipInspectorModalProps> = ({
  clip,
  onClose,
  copiedClipId,
  onCopyClip,
  onTogglePin,
  onDeleteClip,
  onDownloadClip,
  onRenameClip,
}) => {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [wordHtmlBlobUrl, setWordHtmlBlobUrl] = useState<string | null>(null);
  const [asyncWordParagraphs, setAsyncWordParagraphs] = useState<string[] | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');

  const clipId = clip?.id;
  const clipTitle = clip?.title;
  const clipDataUrl = clip?.fileDataUrl;
  const clipExtractedText = clip?.extractedText;

  useEffect(() => {
    if (!clipId) return;
    setIsEditingTitle(false);
    setDraftTitle(clipTitle || '');

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clipId, clipTitle, onClose]);

  useEffect(() => {
    if (!clip || !isPdfClip(clip)) {
      setPdfBlobUrl(null);
      return;
    }

    const payload = getClipDownloadPayload(clip, 'pdf');
    const blob = new Blob([payload.bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    setPdfBlobUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [clipId, clipTitle, clipDataUrl]);

  useEffect(() => {
    let active = true;
    setAsyncWordParagraphs(null);

    if (!clip || !isWordClip(clip)) {
      setWordHtmlBlobUrl(null);
      return;
    }

    const buildViewerAndExtract = async () => {
      let paragraphs = extractWordPreviewInfo(clip).paragraphs;

      if (!clipExtractedText && clipDataUrl) {
        const decoded = dataUrlToUint8Array(clipDataUrl);
        if (decoded) {
          const extracted = await extractTextFromDocxBytes(decoded.bytes);
          if (extracted && active) {
            const lines = extracted
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean);
            if (lines.length > 0) {
              paragraphs = lines;
              setAsyncWordParagraphs(lines);
            }
          }
        }
      }

      if (!active) return;

      const escapedTitle = (clip.title || 'Word Document')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const bodyHtml = paragraphs
        .map(
          (p, i) =>
            `<p style="${
              i === 0
                ? 'font-size:20px;font-weight:700;color:#1c1917;margin-bottom:18px;'
                : 'font-size:15px;line-height:1.7;color:#292524;margin-bottom:12px;'
            }">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
        )
        .join('');

      const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapedTitle} — Word Document Viewer</title>
  <style>
    body { margin: 0; padding: 40px 20px; background: #f5f5f4; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .page { max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #e7e5e4; border-radius: 12px; padding: 56px 64px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    .meta { font-family: monospace; font-size: 12px; color: #78716c; border-bottom: 1px solid #f5f5f4; padding-bottom: 14px; margin-bottom: 28px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="page">
    <div class="meta">
      <span>${escapedTitle}</span>
      <span>Microsoft Word Document (.docx)</span>
    </div>
    ${bodyHtml}
  </div>
</body>
</html>`;

      const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      setWordHtmlBlobUrl(url);
    };

    buildViewerAndExtract();

    return () => {
      active = false;
      setWordHtmlBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [clipId, clipTitle, clipDataUrl, clipExtractedText]);

  if (!clip) return null;

  const isCopied = copiedClipId === clip.id;
  const isPdf = isPdfClip(clip);
  const isWord = !isPdf && isWordClip(clip);
  const pdfInfo = isPdf ? extractPdfPreviewInfo(clip) : null;
  const wordInfo = isWord ? extractWordPreviewInfo(clip) : null;
  const displayedWordParagraphs = asyncWordParagraphs || wordInfo?.paragraphs || [];

  const handleSaveTitle = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftTitle.trim();
    if (trimmed && onRenameClip) {
      onRenameClip(clip.id, trimmed);
    }
    setIsEditingTitle(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspector-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white border border-stone-200 rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-stone-200">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-stone-500 font-mono tabular-nums flex flex-wrap items-center gap-1.5">
              <span>{formatBytes(clip.sizeBytes)}</span>
              <span>·</span>
              <span>Keep: {clip.ttlLabel}</span>
              <span>·</span>
              {clip.status === 'synced' ? (
                <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Saved in Cloud
                </span>
              ) : (
                <span className="text-stone-700 font-medium inline-flex items-center gap-1">
                  <CloudUpload className="w-3.5 h-3.5" /> Uploading ({clip.progress}%)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              <h2
                id="inspector-modal-title"
                className="text-lg font-bold text-stone-900 truncate"
              >
                {clip.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {clip.category === 'image' ? (
            <div className="bg-stone-100 border border-stone-200/80 rounded-xl overflow-hidden flex items-center justify-center p-4">
              <img
                src={clip.fileDataUrl || clip.content}
                alt={clip.title}
                referrerPolicy="no-referrer"
                className="max-h-96 w-auto object-contain rounded-lg"
              />
            </div>
          ) : isPdf && pdfInfo ? (
            <div className="space-y-3">
              {/* PDF Metadata Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-50 border border-stone-200/90 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-stone-900 text-white rounded-md shrink-0">
                    {pdfInfo.version}
                  </span>
                  <span className="text-xs font-medium text-stone-800 truncate">
                    {pdfInfo.filename}
                  </span>
                  <span className="text-xs text-stone-400 font-mono tabular-nums shrink-0">
                    · {pdfInfo.pageCount} {pdfInfo.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                    {formatBytes(pdfInfo.byteLength)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {pdfBlobUrl && (
                    <a
                      href={pdfBlobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 hover:bg-stone-100 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open PDF</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Crisp PDF Document Sheet Preview */}
              <div className="bg-stone-100 border border-stone-200/90 rounded-xl p-5 flex justify-center">
                <div className="bg-white border border-stone-200 shadow-xs rounded-lg w-full max-w-lg p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-5 h-5 text-stone-700 shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-stone-900 truncate">
                          {pdfInfo.filename}
                        </h3>
                        <p className="text-[11px] text-stone-400 font-mono tabular-nums">
                          application/pdf · Verified Binary Document
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-stone-400 shrink-0">
                      Page 1 / {pdfInfo.pageCount}
                    </span>
                  </div>

                  <div className="space-y-2 py-2 min-h-36">
                    {pdfInfo.extractedLines.map((line, idx) => (
                      <p
                        key={idx}
                        className={
                          idx === 0
                            ? 'text-sm font-semibold text-stone-900'
                            : 'text-xs text-stone-700 font-mono leading-relaxed break-words'
                        }
                      >
                        {line}
                      </p>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400 font-mono">
                    <span>{clip.sha256.slice(0, 24)}</span>
                    <button
                      type="button"
                      onClick={() => onDownloadClip(clip, false)}
                      className="text-stone-900 font-sans font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download viewable PDF</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : isWord && wordInfo ? (
            <div className="space-y-3">
              {/* Word Document Metadata Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-50 border border-stone-200/90 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-stone-900 text-white rounded-md shrink-0">
                    {wordInfo.formatLabel}
                  </span>
                  <span className="text-xs font-medium text-stone-800 truncate">
                    {wordInfo.filename}
                  </span>
                  <span className="text-xs text-stone-400 font-mono tabular-nums shrink-0">
                    · {displayedWordParagraphs.length}{' '}
                    {displayedWordParagraphs.length === 1 ? 'paragraph' : 'paragraphs'} ·{' '}
                    {formatBytes(wordInfo.byteLength)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {wordHtmlBlobUrl && (
                    <a
                      href={wordHtmlBlobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 hover:bg-stone-100 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open in Browser</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Crisp Word Document Sheet Preview */}
              <div className="bg-stone-100 border border-stone-200/90 rounded-xl p-5 flex justify-center">
                <div className="bg-white border border-stone-200 shadow-xs rounded-lg w-full max-w-lg p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-100">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-5 h-5 text-stone-700 shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-stone-900 truncate">
                          {wordInfo.filename}
                        </h3>
                        <p className="text-[11px] text-stone-400 font-mono tabular-nums">
                          OpenXML Word Document (.docx) · Ready to View & Download
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-stone-400 shrink-0">
                      {wordInfo.formatLabel}
                    </span>
                  </div>

                  <div className="space-y-2.5 py-2 min-h-36">
                    {displayedWordParagraphs.map((paragraph, idx) => (
                      <p
                        key={idx}
                        className={
                          idx === 0
                            ? 'text-sm font-semibold text-stone-900 leading-snug'
                            : 'text-xs text-stone-700 leading-relaxed break-words'
                        }
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400 font-mono">
                    <span>{clip.sha256.slice(0, 24)}</span>
                    <div className="flex items-center gap-3 font-sans">
                      <button
                        type="button"
                        onClick={() => onDownloadClip(clip, 'pdf')}
                        className="text-stone-600 font-medium hover:text-stone-900 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Save as PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDownloadClip(clip, 'docx')}
                        className="text-stone-900 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download Word (.docx)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-stone-900 text-stone-100 rounded-xl p-4 font-mono text-xs overflow-x-auto">
              <pre className="leading-relaxed whitespace-pre-wrap break-words">
                <code>{clip.content}</code>
              </pre>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onTogglePin(clip.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>{clip.pinned ? 'Pinned' : 'Pin'}</span>
            </button>

            <button
              type="button"
              onClick={() => onDeleteClip(clip.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-stone-200 hover:bg-red-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isPdf && clip.category !== 'image' && (
              <button
                type="button"
                onClick={() => onDownloadClip(clip, 'pdf')}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            )}

            {!isWord && clip.category !== 'image' && (
              <button
                type="button"
                onClick={() => onDownloadClip(clip, 'docx')}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Download Word</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onDownloadClip(clip, isWord ? 'docx' : false)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-200 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {isPdf ? 'Download PDF' : isWord ? 'Download Word (.docx)' : 'Download'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onCopyClip(clip)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
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
          </div>
        </div>
      </div>
    </div>
  );
};
