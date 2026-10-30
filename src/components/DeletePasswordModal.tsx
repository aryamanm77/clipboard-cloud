import React, { useState, useEffect, useRef } from 'react';
import { Lock, X, AlertCircle, Trash2 } from 'lucide-react';
import { verifyDeletePassword } from '../utils/uploadEngine.ts';

interface DeletePasswordModalProps {
  open: boolean;
  targetLabel: string;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}

export const DeletePasswordModal: React.FC<DeletePasswordModalProps> = ({
  open,
  targetLabel,
  onConfirm,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setPassword('');
      setError(null);
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyDeletePassword(password)) {
      setError('Incorrect password. Enter the 4-digit delete password.');
      inputRef.current?.focus();
      return;
    }
    setError(null);
    onConfirm(password.trim());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-password-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white border border-stone-200 p-6 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="delete-password-title" className="text-base font-semibold text-stone-900">
                Enter Password to Delete
              </h3>
              <p className="text-xs text-stone-500 truncate mt-0.5">{targetLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Close password dialog"
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div>
            <label htmlFor="delete-password-input" className="block text-xs font-medium text-stone-600 mb-1.5">
              Password
            </label>
            <input
              id="delete-password-input"
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter password"
              className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 placeholder:tracking-normal placeholder:font-sans focus:bg-white focus:border-stone-600 focus:outline-none"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200/80 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Confirm Delete</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
