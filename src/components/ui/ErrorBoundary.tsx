import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
          <div className="card max-w-lg w-full p-8 text-center shadow-lg border border-neutral-200">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <AlertTriangle size={32} />
            </div>
            <h1 className="text-xl font-bold text-neutral-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-neutral-600 mb-4">
              An unexpected error prevented this page from displaying.
            </p>
            {this.state.error?.message && (
              <div className="mb-6 p-3 bg-neutral-100 rounded text-left font-mono text-xs text-red-700 overflow-x-auto max-h-40 border border-neutral-200">
                {this.state.error.message}
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="btn btn-primary"
              >
                <RefreshCw size={16} />
                Reload Application
              </button>
              <a href="/" className="btn btn-secondary">
                <Home size={16} />
                Back to Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
