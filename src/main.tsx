import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { ToastProvider } from './contexts/ToastContext.tsx';

import { registerSW } from 'virtual:pwa-register';

if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

// Global error handling for system stability
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes('fetch')) {
    console.warn('[RAFIKI] Intercepted fetch transport error. Re-authentication may be required.');
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </ToastProvider>
  </StrictMode>,
);
