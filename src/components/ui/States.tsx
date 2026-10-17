import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-neutral-200', className)} />;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="text-neutral-300 mb-3">{icon}</div>}
      <h3 className="text-sm font-semibold text-neutral-600">{title}</h3>
      {message && <p className="text-sm text-neutral-400 mt-1 max-w-sm">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingSpinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn('animate-spin rounded-full border-2 border-neutral-300 border-t-primary-600', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-sm text-error">{message}</p>
      {onRetry && (
        <button className="btn-secondary btn-sm mt-3" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
