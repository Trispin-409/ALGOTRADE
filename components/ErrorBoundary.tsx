
import React, { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public render(): React.ReactNode {
    // @ts-ignore
    const { children } = this.props;
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-4 text-slate-500 bg-slate-900/40 rounded-2xl border border-white/5">
          <p>Market Data temporarily unavailable</p>
        </div>
      );
    }

    return children;
  }
}
