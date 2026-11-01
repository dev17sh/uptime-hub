import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { TimeSeriesPoint } from '../types';

interface ResponseChartProps {
  data: TimeSeriesPoint[];
}

export default function ResponseChart({ data }: ResponseChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-400">
        No response time metrics recorded in this window yet.
      </div>
    );
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="p95Gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            unit="ms"
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as TimeSeriesPoint;
                return (
                  <div className="bg-white p-3 shadow-lg rounded-xl border border-gray-100 text-xs space-y-1">
                    <p className="font-semibold text-gray-800">{label}</p>
                    <p className="text-indigo-600 font-medium">
                      Avg Response: <span className="font-bold">{item.avgLatency}ms</span>
                    </p>
                    <p className="text-cyan-600 font-medium">
                      p95 Response: <span className="font-bold">{item.p95Latency}ms</span>
                    </p>
                    <p className="text-gray-500">
                      Uptime: <span className="font-bold text-emerald-600">{item.uptime}%</span> ({item.totalChecks} checks)
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="p95Latency"
            name="p95 Latency"
            stroke="#06b6d4"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            fillOpacity={1}
            fill="url(#p95Gradient)"
          />
          <Area
            type="monotone"
            dataKey="avgLatency"
            name="Average Latency"
            stroke="#4f46e5"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#latencyGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
