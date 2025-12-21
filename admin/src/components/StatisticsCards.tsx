import type { StatisticsResponse } from "../types/admin";

export function StatisticsCards({ stats }: { stats: StatisticsResponse }) {
  return (
    <div className="stat-grid">
      <div className="stat-card">
        <p>Total wallets</p>
        <h3>{stats.totalWallets}</h3>
      </div>
      <div className="stat-card">
        <p>Expiring soon</p>
        <h3>{stats.expiringSoon}</h3>
      </div>
      <div className="stat-card">
        <p>Expired</p>
        <h3>{stats.expired}</h3>
      </div>
      <div className="stat-card">
        <p>Last synced block</p>
        <h3>{stats.lastSyncedBlock}</h3>
      </div>
    </div>
  );
}
