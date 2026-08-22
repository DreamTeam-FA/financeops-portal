import React from "react";

interface Props {
  children: React.ReactNode;
  /** Optional label shown in the error card, e.g. "AP Dashboard" */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * React class component that catches render-time errors in the subtree.
 *
 * Usage:
 *   <ErrorBoundary label="AP Dashboard">
 *     <APPage />
 *   </ErrorBoundary>
 *
 * On error: renders a recovery card with the message + a "Reload page" button.
 * The error is also logged to the browser console for debugging.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Log for debugging — keep this even in production so it shows in Render logs
    console.error("[ErrorBoundary] Caught render error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const label = this.props.label ? `${this.props.label} — ` : "";
    const message = this.state.error?.message || "Unknown error";

    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-[#070b12]">
        <div className="max-w-lg w-full rounded-2xl border border-red-900/50 bg-[#0d111a] shadow-2xl overflow-hidden">
          {/* Red header band */}
          <div className="px-6 py-4 bg-red-950/50 border-b border-red-900/40 flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h2 className="text-sm font-bold text-red-300">{label}Something went wrong</h2>
              <p className="text-[11px] text-red-400/80 mt-0.5">A render error was caught and this section stopped loading.</p>
            </div>
          </div>

          {/* Error detail */}
          <div className="px-6 py-4 space-y-3">
            <div className="rounded-lg bg-[#070b12] border border-[#1a2235] p-3">
              <p className="text-[11px] font-mono text-red-400 break-words">{message}</p>
            </div>

            <p className="text-xs text-[#7a90b0] leading-relaxed">
              This could be caused by unexpected data from Google Sheets, a corrupted localStorage entry, or a bug in this section.
              Your data in Google Sheets is safe — this is a display-only error.
            </p>

            {/* Component stack (collapsed) */}
            {this.state.errorInfo?.componentStack && (
              <details className="group">
                <summary className="text-[11px] text-[#556] cursor-pointer hover:text-[#888] select-none">
                  Show component stack
                </summary>
                <pre className="mt-2 text-[10px] text-[#556] overflow-x-auto p-2 bg-[#070b12] rounded border border-[#1a2235] whitespace-pre-wrap break-words">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 pb-5 flex items-center gap-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg border border-[#1a2235] hover:bg-[#1a2235] text-[#c8d4e8] text-xs font-semibold transition-colors"
            >
              Reload Page
            </button>
            <button
              onClick={() => {
                // Clear localStorage and reload — nuclear option
                if (window.confirm("This clears local state and reloads. Your Sheet data is safe. Continue?")) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              className="ml-auto px-3 py-2 rounded-lg text-red-500 hover:bg-red-950/30 text-[11px] font-semibold transition-colors"
            >
              Clear cache & reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
