'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        console.log('Service Worker registered for offline support');
      })
      .catch((error) => {
        console.error('SW registration failed:', error);
      });
  }, []);

  return null;
}
