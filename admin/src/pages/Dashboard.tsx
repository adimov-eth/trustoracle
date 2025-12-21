import { AlertBanner } from "../components/AlertBanner";
import { RiskChart } from "../components/RiskChart";
import { StatisticsCards } from "../components/StatisticsCards";
import { useStatistics } from "../hooks/useStatistics";

export function Dashboard() {
  const { data, isLoading, error } = useStatistics();

  if (isLoading) {
    return <div className="panel">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="panel">Failed to load statistics.</div>;
  }

  if (!data) {
    return <div className="panel">No statistics available.</div>;
  }

  const countryRows = Object.entries(data.byCountry)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  return (
    <div className="stack">
      <AlertBanner stats={data} />
      <StatisticsCards stats={data} />
      <div className="grid-two">
        <RiskChart data={data.byRiskLevel} />
        <div className="panel">
          <div className="panel-header">
            <h2>Top jurisdictions</h2>
            <span className="badge badge-neutral">Top 8</span>
          </div>
          <div className="list">
            {countryRows.length === 0 && (
              <p className="muted">No wallet records indexed yet.</p>
            )}
            {countryRows.map(([country, count]) => (
              <div key={country} className="list-row">
                <span>{country || "N/A"}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
