import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMonitorByIdApi,
  getMonitorUptimeApi,
  getMonitorChecksApi,
  triggerCheckApi,
  pauseMonitorApi,
  resumeMonitorApi,
  deleteMonitorApi,
} from '../api/monitors';
import { getIncidentsApi } from '../api/incidents';
import StatusBadge from '../components/StatusBadge';
import ResponseChart from '../components/ResponseChart';
import {
  ArrowLeft,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  ExternalLink,
  Clock,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import type { Monitor, UptimeStats, CheckResult, Incident } from '../types';

export default function MonitorDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [isChecking, setIsChecking] = useState(false);

  // Monitor detail query
  const { data: monitor, isLoading: isMonitorLoading } = useQuery<Monitor>({
    queryKey: ['monitor', id],
    queryFn: () => getMonitorByIdApi(id),
    refetchInterval: 15000,
  });

  // Uptime analytics query
  const { data: uptimeStats, isLoading: isStatsLoading } = useQuery<UptimeStats>({
    queryKey: ['monitor-uptime', id, range],
    queryFn: () => getMonitorUptimeApi(id, range),
    refetchInterval: 15000,
  });

  // Recent checks query
  const { data: checksData, isLoading: isChecksLoading } = useQuery<{
    checks: CheckResult[];
    total: number;
  }>({
    queryKey: ['monitor-checks', id],
    queryFn: () => getMonitorChecksApi(id, { limit: 25 }),
    refetchInterval: 15000,
  });

  // Monitor incidents query
  const { data: incidents = [], isLoading: isIncidentsLoading } = useQuery<Incident[]>({
    queryKey: ['monitor-incidents', id],
    queryFn: () => getIncidentsApi({ monitorId: id }),
    refetchInterval: 15000,
  });

  // Mutations
  const pauseMutation = useMutation({
    mutationFn: () => pauseMonitorApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitor', id] });
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeMonitorApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitor', id] });
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteMonitorApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
      navigate('/');
    },
  });

  const handleManualCheck = async () => {
    try {
      setIsChecking(true);
      await triggerCheckApi(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['monitor', id] }),
        queryClient.invalidateQueries({ queryKey: ['monitor-uptime', id] }),
        queryClient.invalidateQueries({ queryKey: ['monitor-checks', id] }),
        queryClient.invalidateQueries({ queryKey: ['monitor-incidents', id] }),
      ]);
    } finally {
      setIsChecking(false);
    }
  };

  if (isMonitorLoading) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading monitor metrics...</p>
      </div>
    );
  }

  if (!monitor) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">Monitor not found or was deleted.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Navigation & Actions Bar */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to monitors
        </Link>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-2xs">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{monitor.name}</h1>
              <StatusBadge status={monitor.currentStatus} isActive={monitor.isActive} size="lg" />
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <a
                href={monitor.url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-indigo-600 flex items-center gap-1 truncate max-w-sm sm:max-w-xl"
              >
                {monitor.url}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <span>&bull;</span>
              <span>Every {monitor.intervalSeconds}s</span>
              <span>&bull;</span>
              <span>Timeout {monitor.timeoutMs}ms</span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={handleManualCheck}
              disabled={isChecking}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              Check Now
            </button>

            {monitor.isActive ? (
              <button
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-xs font-semibold transition-colors"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
            ) : (
              <button
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-semibold transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Resume
              </button>
            )}

            <button
              onClick={() => {
                if (confirm(`Are you sure you want to delete monitor "${monitor.name}"?`)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              title="Delete monitor"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Analytics Section & Range Toggle */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">Uptime & Latency Metrics</h2>
          <div className="inline-flex bg-gray-100 p-1 rounded-xl text-xs font-medium">
            {(['24h', '7d', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  range === r
                    ? 'bg-white text-gray-900 shadow-2xs font-semibold'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider">
              <Activity className="w-4 h-4 text-emerald-600" /> Uptime ({range})
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {isStatsLoading ? '...' : `${uptimeStats?.uptimePercentage ?? 100}%`}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {uptimeStats?.successfulChecks || 0} ok / {uptimeStats?.failedChecks || 0} failed
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider">
              <Zap className="w-4 h-4 text-indigo-600" /> Avg Latency
            </div>
            <p className="text-3xl font-bold text-indigo-600 mt-2">
              {isStatsLoading ? '...' : `${uptimeStats?.avgResponseTimeMs ?? 0}ms`}
            </p>
            <p className="text-xs text-gray-400 mt-1">Mean response time</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider">
              <Clock className="w-4 h-4 text-cyan-600" /> p95 Latency
            </div>
            <p className="text-3xl font-bold text-cyan-600 mt-2">
              {isStatsLoading ? '...' : `${uptimeStats?.p95ResponseTimeMs ?? 0}ms`}
            </p>
            <p className="text-xs text-gray-400 mt-1">95% of checks faster than this</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider">
              <CheckCircle className="w-4 h-4 text-gray-500" /> Total Checks
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {isStatsLoading ? '...' : uptimeStats?.totalChecks ?? 0}
            </p>
            <p className="text-xs text-gray-400 mt-1">In the last {range}</p>
          </div>
        </div>

        {/* Latency History Chart */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-2xs space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-900">Response Time Trend</h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-indigo-600 font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block" /> Avg Latency
              </span>
              <span className="flex items-center gap-1.5 text-cyan-600 font-medium">
                <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500 inline-block" /> p95 Latency
              </span>
            </div>
          </div>
          <ResponseChart data={uptimeStats?.timeSeries || []} />
        </div>
      </div>

      {/* Grid: Recent Checks & Outage Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Checks Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-900">Recent Probes</h3>
            <span className="text-xs text-gray-400">{checksData?.total || 0} total</span>
          </div>

          {isChecksLoading ? (
            <div className="p-8 text-center text-gray-400 text-xs">Loading checks...</div>
          ) : !checksData?.checks || checksData.checks.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs">No checks recorded yet.</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {checksData.checks.map((c) => (
                <div key={c.id} className="px-6 py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${c.isUp ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    />
                    <div>
                      <span className="font-semibold text-gray-800">
                        {c.statusCode ? `HTTP ${c.statusCode}` : c.errorType || 'Failed'}
                      </span>
                      {c.errorMessage && (
                        <p className="text-gray-400 truncate max-w-xs">{c.errorMessage}</p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono text-gray-700">
                      {c.responseTimeMs ? `${c.responseTimeMs}ms` : '—'}
                    </span>
                    <p className="text-gray-400">
                      {new Date(c.checkedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Incident History List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-900">Incident Outages</h3>
            <span className="text-xs text-gray-400">{incidents.length} recorded</span>
          </div>

          {isIncidentsLoading ? (
            <div className="p-8 text-center text-gray-400 text-xs">Loading incidents...</div>
          ) : incidents.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs flex flex-col items-center">
              <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
              <p className="font-medium text-gray-700">No recorded outages</p>
              <p className="text-gray-400 mt-0.5">This monitor has 100% clean incident history.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {incidents.map((inc) => (
                <div key={inc.id} className="p-4 sm:px-6 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        className={`w-4 h-4 ${inc.status === 'OPEN' ? 'text-rose-500' : 'text-gray-400'}`}
                      />
                      <span className="font-bold text-gray-800">
                        {inc.status === 'OPEN' ? 'Downtime in Progress' : 'Resolved Incident'}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full font-semibold ${
                        inc.status === 'OPEN'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {inc.status}
                    </span>
                  </div>

                  <p className="text-gray-600">{inc.failureReason || 'Target outage detected'}</p>

                  <div className="flex justify-between text-gray-400 pt-1">
                    <span>Started: {new Date(inc.startedAt).toLocaleString()}</span>
                    <span>
                      {inc.resolvedAt
                        ? `Resolved: ${new Date(inc.resolvedAt).toLocaleTimeString()}`
                        : 'Ongoing'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
