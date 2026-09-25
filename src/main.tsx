import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Registers the service worker ourselves (injectRegister: false in vite.config.ts) so we can
// force an already-open tab to pick up a new deploy instead of silently keeping the old JS in
// memory. onNeedRefresh fires once the new worker has installed; calling updateSW(true) makes it
// skipWaiting + take over immediately, and the resulting controllerchange reloads this tab once.
// Checks for an update on load and every 30 minutes while the tab stays open.
if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      registration.update().catch(() => {});
      setInterval(() => registration.update().catch(() => {}), 30 * 60 * 1000);
    },
    onNeedRefresh() {
      updateSW(true);
    },
  });

  // A brand-new visitor has no controller yet, so their first-ever activation also fires
  // controllerchange — only reload when a controller is being REPLACED (an actual update).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
