'use client';
import { Component } from 'react';

/**
 * React Error Boundary — catches component crashes and shows a recovery UI
 * instead of a blank white screen. This is the ONLY way to catch render errors
 * in React (try/catch doesn't work in JSX).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          minHeight: '200px',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20, maxWidth: 400 }}>
            This section encountered an error. Your data is safe — try refreshing the page.
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            ↻ Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
