import { useCallback, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToastContext, type ToastType } from '@/components/ui/toast-context';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const icons = {
    success: <CheckCircle size={20} aria-hidden="true" className="text-success" />,
    error: <XCircle size={20} aria-hidden="true" className="text-critical" />,
    warning: <AlertCircle size={20} aria-hidden="true" className="text-moderate" />,
    info: <Info size={20} aria-hidden="true" className="text-primary-600" />,
  };
  const toastStyles = {
    success: 'border-l-4 border-l-success',
    error: 'border-l-4 border-l-critical',
    warning: 'border-l-4 border-l-moderate',
    info: 'border-l-4 border-l-primary-600',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-24 left-4 right-4 z-[2000] flex flex-col items-center gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn('flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-panel border border-line bg-surface px-4 py-3 text-ink shadow-lift', toastStyles[t.type])}
          >
            {icons[t.type]}
            <p className="flex-1 text-[15px]">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-neutral-500 transition-colors hover:text-ink" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
