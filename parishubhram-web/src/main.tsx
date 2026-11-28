import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import './index.css'
import { ToastProvider } from './lib/toast'
import App from './App.tsx'
import WardDashboard from './pages/WardDashboard.tsx'
import StatsPage from './pages/StatsPage.tsx'
import OfficialsPage from './pages/OfficialsPage.tsx'

// Point MapLibre to the Vite-bundled worker file so it loads in production
maplibregl.setWorkerUrl(maplibreWorkerUrl)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Home page — the full map + feed */}
          <Route path="/" element={<App />} />

          {/* Ward detail page — /ward/<uuid> */}
          <Route path="/ward/:wardId" element={<WardDashboard />} />

          {/* Public analytics & CSV export — /stats */}
          <Route path="/stats" element={<StatsPage />} />

          {/* Officials & Corporators accountability directory */}
          <Route path="/officials" element={<OfficialsPage />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>,
)
