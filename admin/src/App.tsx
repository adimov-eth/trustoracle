import { NavLink, Route, Routes } from "react-router-dom";

import { APP_NAME, BACKEND_URL, CHAIN_ID } from "./lib/config";
import { AuditLog } from "./pages/AuditLog";
import { Dashboard } from "./pages/Dashboard";
import { Transfers } from "./pages/Transfers";
import { Wallets } from "./pages/Wallets";

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">TS</span>
          <div>
            <h1>{APP_NAME}</h1>
            <p>Compliance ops</p>
          </div>
        </div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/wallets" className={({ isActive }) => (isActive ? "active" : "")}>
            Wallet registry
          </NavLink>
          <NavLink to="/transfers" className={({ isActive }) => (isActive ? "active" : "")}>
            Transfer queue
          </NavLink>
          <NavLink to="/audit" className={({ isActive }) => (isActive ? "active" : "")}>
            Audit log
          </NavLink>
        </nav>
        <div className="sidebar-meta">
          <div>
            <span>Chain</span>
            <strong>{CHAIN_ID}</strong>
          </div>
          <div>
            <span>Backend</span>
            <strong>{BACKEND_URL.replace(/^https?:\/\//, "")}</strong>
          </div>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/wallets" element={<Wallets />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}
