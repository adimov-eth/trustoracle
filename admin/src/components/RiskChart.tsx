import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export function RiskChart({
  data
}: {
  data: Record<number, number>;
}) {
  const chartData = [
    { name: "Unknown", value: data[0] ?? 0 },
    { name: "Green", value: data[1] ?? 0 },
    { name: "Yellow", value: data[2] ?? 0 },
    { name: "Red", value: data[3] ?? 0 }
  ];

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Risk distribution</h2>
        <span className="badge badge-neutral">Live</span>
      </div>
      <div className="chart">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(0,0,0,0.1)" />
            <XAxis dataKey="name" tick={{ fill: "#4d3e32", fontSize: 12 }} />
            <YAxis tick={{ fill: "#4d3e32", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.1)"
              }}
            />
            <Bar dataKey="value" fill="#3b6e8c" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
