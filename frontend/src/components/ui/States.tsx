import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-control bg-neutral-200', className)} />;
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
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-neutral-400" aria-hidden="true">{icon}</div>}
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-[15px] text-neutral-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingSpinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn('animate-spin rounded-full border-2 border-neutral-300 border-t-primary-600 motion-reduce:animate-none', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-[15px] font-medium text-critical">{message}</p>
      {onRetry && (
        <button className="btn-secondary btn-sm mt-3" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
