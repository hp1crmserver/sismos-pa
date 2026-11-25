import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('GeoAlert-pa render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#070B12] text-slate-900 dark:text-slate-100 p-6">
          <div className="max-w-md w-full rounded-lg border border-rose-500/40 bg-white dark:bg-[#0F172A] p-6 space-y-3 shadow-sm">
            <h1 className="text-base font-bold text-rose-600 dark:text-rose-400">
              Error al inicializar GeoAlert-pa
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {this.state.error.message || 'Ocurrió un error inesperado en la interfaz.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3.5 py-2 text-xs font-semibold rounded-md bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
