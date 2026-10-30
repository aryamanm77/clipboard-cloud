import React, { useState, useRef } from 'react';
import {
  CloudUpload,
  FileUp,
  ClipboardPaste,
  AlertCircle,
  FileText,
  X,
  Tag,
} from 'lucide-react';
import {
  SYNC_SPEED_PROFILES,
  formatBytes,
  resolveUploadFileName,
  type SyncSpeedProfileId,
} from '../utils/uploadEngine.ts';

export interface NamedUploadFile {
  file: File;
  customName: string;
}

interface PasteComposerProps {
  onCreateTextClip: (title: string, content: string, ttlLabel: string) => void;
  onUploadFiles: (
    files: FileList | File[] | NamedUploadFile[],
    ttlLabel: string,
    customTitle?: string
  ) => void;
  speedProfile: SyncSpeedProfileId;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export const PasteComposer: React.FC<PasteComposerProps> = ({
  onCreateTextClip,
  onUploadFiles,
  speedProfile,
  textareaRef,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [ttlLabel, setTtlLabel] = useState('7 days');
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const currentProfile = SYNC_SPEED_PROFILES[speedProfile];

  const stageIncomingFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;
    setValidationError(null);

    setStagedFiles((prev) => [...prev, ...incoming]);
    // Focus the Name input if empty so the user can type their custom name before clicking Upload
    if (!title.trim()) {
      window.setTimeout(() => {
        titleInputRef.current?.focus();
      }, 20);
    }
  };

  const handleRemoveStagedFile = (indexToRemove: number) => {
    setStagedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (stagedFiles.length === 0 && !content.trim()) {
      setValidationError('Select a file using "Choose File to Upload" or paste text below first.');
      return;
    }

    setValidationError(null);

    if (stagedFiles.length > 0) {
      const namedFiles: NamedUploadFile[] = stagedFiles.map((file, idx) => {
        if (stagedFiles.length === 1) {
          return {
            file,
            customName: resolveUploadFileName(title, file.name),
          };
        }
        const baseCustom = title.trim() ? `${title.trim()} (${idx + 1})` : '';
        return {
          file,
          customName: resolveUploadFileName(baseCustom, file.name),
        };
      });

      onUploadFiles(namedFiles, ttlLabel, title.trim());

      if (content.trim()) {
        const textTitle =
          title.trim() ||
          content
            .trim()
            .split('\n')[0]
            .slice(0, 48)
            .replace(/\s+/g, ' ') ||
          'Untitled Note';
        onCreateTextClip(textTitle, content, ttlLabel);
      }

      setStagedFiles([]);
      setTitle('');
      setContent('');
      return;
    }

    const resolvedTitle =
      title.trim() ||
      content
        .trim()
        .split('\n')[0]
        .slice(0, 48)
        .replace(/\s+/g, ' ') ||
      'Untitled Note';

    onCreateTextClip(resolvedTitle, content, ttlLabel);
    setTitle('');
    setContent('');
  };

  const handlePasteInsideBox = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      stageIncomingFiles(e.clipboardData.files);
    }
  };

  const handleReadSystemClipboard = async () => {
    setValidationError(null);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          setContent(clipText);
          textareaRef.current?.focus();
          return;
        }
      }
      setValidationError('Press Ctrl+V (or Cmd+V) to paste directly.');
    } catch {
      setValidationError('Press Ctrl+V (or Cmd+V) anywhere on the page to paste.');
    }
  };

  return (
    <section
      aria-label="New Clip"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          stageIncomingFiles(e.dataTransfer.files);
        }
      }}
      className={`bg-white border rounded-2xl p-5 transition-colors ${
        isDragging ? 'border-stone-900 bg-stone-50' : 'border-stone-200/90'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        aria-label="Upload files"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            stageIncomingFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Top Header Bar with Prominent File Upload & Paste Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-stone-200/80">
        <div>
          <h2 className="text-base font-bold text-stone-900">Name & Upload File or Text</h2>
          <p className="text-xs text-stone-500">
            Enter a name, choose any file (PDF, Word, Image, ZIP, Video) or paste text, then click Upload to Cloud.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
          >
            <FileUp className="w-4 h-4" />
            <span>Choose File to Upload</span>
          </button>

          <button
            type="button"
            onClick={handleReadSystemClipboard}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200/80 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-stone-600" />
            <span>Paste Clipboard</span>
          </button>

          <span className="text-xs text-stone-400 font-mono tabular-nums pl-1">
            {(currentProfile.targetDurationMs / 1000).toFixed(1)}s sync
          </span>
        </div>
      </div>

      {/* Main Form: 1. Name -> 2. File Upload Dropzone / Text -> 3. Upload to Cloud */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Step 1: Enter Name before uploading */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label
              htmlFor="clip-title-input"
              className="block text-xs font-semibold text-stone-800 mb-1.5"
            >
              1. Name for Upload
            </label>
            <div className="relative">
              <Tag className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={titleInputRef}
                id="clip-title-input"
                aria-label="Name before uploading"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter name (e.g. Project Report, Notes, Invoice)..."
                className="w-full pl-10 pr-3.5 py-2.5 text-sm font-medium bg-stone-50 border border-stone-300 rounded-xl text-stone-900 placeholder:text-stone-400 focus:bg-white focus:border-stone-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="clip-ttl-select"
              className="block text-xs font-semibold text-stone-800 mb-1.5"
            >
              Retention
            </label>
            <select
              id="clip-ttl-select"
              aria-label="Keep clip for"
              value={ttlLabel}
              onChange={(e) => setTtlLabel(e.target.value)}
              className="w-full sm:w-auto px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl text-stone-700 focus:bg-white focus:border-stone-900 focus:outline-none shrink-0"
            >
              <option value="24 hours">Keep 24h</option>
              <option value="7 days">Keep 7 days</option>
              <option value="30 days">Keep 30 days</option>
              <option value="Permanent">Keep forever</option>
            </select>
          </div>
        </div>

        {/* Step 2: Prominent File Upload Dropzone & Button */}
        <div>
          <span className="block text-xs font-semibold text-stone-800 mb-1.5">
            2. Select File to Upload (or Paste Text Below)
          </span>
          <div
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Click or drag and drop files here to upload"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-2 border-dashed border-stone-300 hover:border-stone-900 bg-stone-50/70 hover:bg-stone-100/60 rounded-xl transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 text-center sm:text-left">
              <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center shrink-0">
                <FileUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900">
                  Click here to choose a file, or drag & drop files
                </p>
                <p className="text-xs text-stone-500">
                  Supports PDF, Word (.docx/.doc), Images, Excel, PowerPoint, ZIP, Audio, Video & Code
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-stone-900 bg-white border border-stone-300 rounded-xl shadow-2xs whitespace-nowrap shrink-0">
              <FileUp className="w-3.5 h-3.5" />
              <span>Browse Files</span>
            </span>
          </div>
        </div>

        {/* Selected Files Ready to Upload with Chosen Name */}
        {stagedFiles.length > 0 && (
          <div
            role="region"
            aria-label="Staged files ready to upload"
            className="bg-emerald-50/80 border-2 border-emerald-500 rounded-xl p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-emerald-950">
              <span>
                Selected {stagedFiles.length} {stagedFiles.length === 1 ? 'file' : 'files'} ready to upload
                {!title.trim() ? ' — enter a Name in Step 1 above or click Upload Now' : ''}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStagedFiles([])}
                  className="text-stone-600 hover:text-red-600 underline cursor-pointer font-medium"
                >
                  Remove all
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>Upload File Now</span>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              {stagedFiles.map((file, idx) => {
                const uploadName =
                  stagedFiles.length === 1
                    ? resolveUploadFileName(title, file.name)
                    : resolveUploadFileName(
                        title.trim() ? `${title.trim()} (${idx + 1})` : '',
                        file.name
                      );
                const ext = file.name.includes('.')
                  ? file.name.split('.').pop()?.toUpperCase() || 'FILE'
                  : 'FILE';
                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between gap-3 bg-white border border-emerald-200/80 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-stone-900 text-white rounded-md shrink-0">
                        {ext}
                      </span>
                      <FileText className="w-4 h-4 text-stone-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 truncate">
                          Uploading as: {uploadName}
                        </p>
                        <p className="text-[11px] text-stone-500 font-mono tabular-nums truncate">
                          {formatBytes(file.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStagedFile(idx)}
                      aria-label={`Remove ${file.name}`}
                      className="p-1 text-stone-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Optional Textarea for Pasting Text/Code */}
        <div>
          <label
            htmlFor="clip-content-textarea"
            className="block text-xs font-semibold text-stone-800 mb-1.5"
          >
            {stagedFiles.length > 0 ? 'Optional Text Note' : 'Or Paste Text / Code'}
          </label>
          <textarea
            id="clip-content-textarea"
            aria-label="Clip text or code"
            ref={textareaRef}
            rows={stagedFiles.length > 0 ? 2 : 3}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (validationError) setValidationError(null);
            }}
            onPaste={handlePasteInsideBox}
            placeholder={
              stagedFiles.length > 0
                ? 'Optional note to include with your file upload...'
                : 'Paste or type text/code here if you are uploading text instead of a file...'
            }
            className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-200/80 rounded-xl text-stone-900 placeholder:text-stone-400 focus:bg-white focus:border-stone-900 focus:outline-none resize-y"
          />
        </div>

        {validationError && (
          <div
            role="alert"
            className="flex items-center gap-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Step 3: Submit / Upload Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs font-medium text-stone-600">
            {stagedFiles.length > 0
              ? `Ready: "${resolveUploadFileName(title, stagedFiles[0].name)}"${
                  stagedFiles.length > 1 ? ` (+${stagedFiles.length - 1} more)` : ''
                }`
              : title.trim()
                ? `Name set to "${title.trim()}"`
                : 'Step 1: Enter Name · Step 2: Choose File or Paste Text · Step 3: Click Upload to Cloud'}
          </span>

          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <CloudUpload className="w-4 h-4" />
            <span>Upload to Cloud</span>
          </button>
        </div>
      </form>
    </section>
  );
};
