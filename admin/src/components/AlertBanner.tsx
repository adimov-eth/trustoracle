import type { StatisticsResponse } from "../types/admin";

export function AlertBanner({
  stats,
  error
}: {
  stats?: StatisticsResponse;
  error?: string | null;
}) {
  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  if (!stats) {
    return null;
  }

  if (stats.expired === 0 && stats.expiringSoon === 0) {
    return (
      <div className="alert alert-success">
        All indexed wallets are within compliance validity windows.
      </div>
    );
  }

  return (
    <div className="alert alert-warning">
      {stats.expired > 0 && (
        <span>{stats.expired} wallet(s) are expired.</span>
      )}
      {stats.expired > 0 && stats.expiringSoon > 0 && <span> </span>}
      {stats.expiringSoon > 0 && (
        <span>{stats.expiringSoon} wallet(s) expire within 7 days.</span>
      )}
    </div>
  );
}
