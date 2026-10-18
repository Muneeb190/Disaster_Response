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
    success: <CheckCircle size={20} aria-hidden="true" className="text-[#7FD1A8]" />,
    error: <XCircle size={20} aria-hidden="true" className="text-[#FF9A8F]" />,
    warning: <AlertCircle size={20} aria-hidden="true" className="text-[#F5C46B]" />,
    info: <Info size={20} aria-hidden="true" className="text-flood" />,
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-24 left-4 right-4 z-[2000] flex flex-col items-center gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn('flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-panel bg-ink px-4 py-3 text-white shadow-lift', t.type === 'error' && 'ring-2 ring-[#FF9A8F]/60')}
          >
            {icons[t.type]}
            <p className="flex-1 text-[15px]">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-[#C9D6D4] hover:text-white" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
