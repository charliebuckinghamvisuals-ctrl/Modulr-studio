/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import BuilderPage from './pages/BuilderPage';
import BusinessPage from './pages/BusinessPage';

export default function App() {
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
