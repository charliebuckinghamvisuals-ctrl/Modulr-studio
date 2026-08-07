/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import BuilderPage from './pages/BuilderPage';
import BusinessPage from './pages/BusinessPage';
import { useStore } from './store';

export default function App() {
  // The host app (Modulr Studio) can push a saved design into this iframe.
  // Same-origin only: the configurator is served from the host's own domain,
  // so anything from elsewhere is not ours.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'LOAD_3D_DESIGN' && event.data.room && typeof event.data.room === 'object') {
        useStore.getState().loadRoom(event.data.room);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<BuilderPage />} />
        <Route path="/builder" element={<BuilderPage />} />
        <Route path="/business" element={<BusinessPage />} />
      </Routes>
    </HashRouter>
  );
}
