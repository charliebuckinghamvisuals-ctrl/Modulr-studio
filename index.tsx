import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// The stylesheet must flow through Vite so Tailwind compiles at build time —
// a raw <link> in index.html would serve it unprocessed.
import './index.css';

// The empty states say "Drop your drawing here", but without these guards the
// browser's default drop behaviour NAVIGATES to the dropped file — replacing
// the whole SPA and losing the session. Views that implement a real drop
// handler still receive their events; everywhere else the drop is ignored
// instead of ending the demo.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Fade the static splash out once React has actually mounted something -
// but hold it on screen for a MINIMUM of 4 seconds (Charlie's call, 25 Aug
// 2026, raised from 2): a branded beat rather than a flicker on fast
// connections. It is a
// floor, not a fake countdown - on slow loads the splash still stays until
// the app is genuinely ready.
// Timer-based rather than requestAnimationFrame: rAF pauses in background
// tabs, and a user who opens the app in a background tab would otherwise
// come back to a splash that never went away.
const SPLASH_MIN_MS = 4000;
const splashShownAt = performance.now();
const dismissSplash = () => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  if (rootElement.childNodes.length > 0) {
    const remaining = Math.max(0, SPLASH_MIN_MS - (performance.now() - splashShownAt));
    setTimeout(() => {
      splash.style.opacity = '0';
      setTimeout(() => splash.remove(), 450);
    }, remaining);
  } else {
    setTimeout(dismissSplash, 50);
  }
};
setTimeout(dismissSplash, 50);