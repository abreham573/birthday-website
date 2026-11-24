import React from 'react';
import { Heart, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Something unexpected happened.',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught an error:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#140205] text-rose-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl p-8 bg-[#24040c] border border-rose-500/30 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-900/60 border border-rose-400/35 flex items-center justify-center">
              <Heart className="w-6 h-6 fill-rose-400 text-rose-400" />
            </div>
            <h1 className="font-serif-cormorant text-3xl font-bold text-white">
              Oops, a small hiccup
            </h1>
            <p className="text-xs sm:text-sm text-rose-200/80 leading-relaxed">
              Something interrupted the page. Tap below to reload Tsi&apos;s birthday surprise cleanly.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white text-xs font-semibold shadow-lg transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Page</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
