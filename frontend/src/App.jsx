import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { Cpu, History, Plus, Book } from 'lucide-react'
import Landing from './pages/Landing'
import Review  from './pages/Review'
import Report  from './pages/Report'
import HistoryPage from './pages/History'

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-surface-950/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center
                          shadow-lg shadow-brand-500/40 group-hover:shadow-brand-400/60 transition-shadow">
            <Cpu size={16} className="text-white" />
          </div>
          <span className="font-extrabold text-white tracking-tight">
            Circuit<span className="text-brand-400">Sense</span>
          </span>
        </NavLink>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          <NavLink
            to="/"
            end
            id="nav-home"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <Plus size={14} /> Analyse
          </NavLink>
          <NavLink
            to="/history"
            id="nav-history"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <History size={14} /> History
          </NavLink>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
            id="nav-api"
            className="nav-link"
          >
            <Book size={14} /> API Docs
          </a>
        </nav>
      </div>
    </header>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Nav />
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
          <Routes>
            <Route path="/"             element={<Landing />} />
            <Route path="/review/:id"   element={<Review />} />
            <Route path="/report/:id"   element={<Report />} />
            <Route path="/history"      element={<HistoryPage />} />
          </Routes>
        </main>
        <footer className="border-t border-white/5 py-4 text-center text-xs text-slate-600">
          CircuitSense — Layer A: deterministic checks · Layer B: LLM via NVIDIA NIM
        </footer>
      </div>
    </BrowserRouter>
  )
}
