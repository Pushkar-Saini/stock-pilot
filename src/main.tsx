import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { Inventory } from './pages/Inventory';
import { Sales } from './pages/Sales';
import { Suppliers } from './pages/Suppliers';
import { Forecasting } from './pages/Forecasting';
import { Settings } from './pages/Settings';

// Phaser is large; load the virtual shop only when it is opened.
const VirtualShop = lazy(() => import('./pages/VirtualShop'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route
            path="shop"
            element={
              <Suspense fallback={<div className="p-10 text-center text-sm text-ink-3">Loading the virtual shop…</div>}>
                <VirtualShop />
              </Suspense>
            }
          />
          <Route path="inventory" element={<Inventory />} />
          <Route path="sales" element={<Sales />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="forecasting" element={<Forecasting />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
