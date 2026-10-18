import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, className, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';

  return (
    <div className="fixed inset-0 z-[1800] flex items-end justify-center p-0 animate-fade-in sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/55" onClick={onClose} />
      <div className={cn('relative w-full max-h-[92vh] overflow-y-auto rounded-t-panel border border-line bg-white shadow-lift sm:rounded-panel', sizeClass, className)}>
        <div className="flex items-center justify-between sticky top-0 z-10 border-b border-line bg-white px-5 py-4">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-control p-2 text-neutral-500 hover:bg-neutral-100 hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Confirmation that records why a decision was made; the reason goes to the audit log.
export function ReasonDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  required = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  required?: boolean;
}) {
  const [reason, setReason] = useState('');
  const close = () => { setReason(''); onClose(); };
  return (
    <Modal open={open} onClose={close} title={title} size="sm">
      <p className="text-sm text-neutral-600 mb-3">{message}</p>
      <label className="label">Reason {required ? '' : <span className="font-normal text-neutral-500">(optional)</span>}</label>
      <textarea className="input resize-none" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded in the activity history" autoFocus />
      <div className="flex justify-end gap-3 mt-4">
        <button className="btn-secondary" onClick={close}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={required && !reason.trim()} onClick={() => { onConfirm(reason.trim()); close(); }}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-neutral-600 mb-5">{message}</p>
      <div className="flex justify-end gap-3">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className={danger ? 'btn-danger' : 'btn-primary'}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
