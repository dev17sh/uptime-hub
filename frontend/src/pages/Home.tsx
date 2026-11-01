import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  getMonitorsApi,
  pauseMonitorApi,
  resumeMonitorApi,
  deleteMonitorApi,
  triggerCheckApi,
} from '../api/monitors';
import StatusBadge from '../components/StatusBadge';
import CreateMonitorModal from '../components/CreateMonitorModal';
import { Activity, Plus, RefreshCw, Pause, Play, Trash2, ArrowUpRight } from 'lucide-react';
import type { Monitor } from '../types';

export default function Home() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const { data: monitors = [], isLoading, error } = useQuery<Monitor[]>({
    queryKey: ['monitors'],
    queryFn: getMonitorsApi,
    refetchInterval: 15000, // 15s polling per Phase 7
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => pauseMonitorApi(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitors'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => resumeMonitorApi(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitors'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMonitorApi(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitors'] }),
  });

  const handleManualCheck = async (id: string) => {
    try {
      setCheckingId(id);
      await triggerCheckApi(id);
      await queryClient.invalidateQueries({ queryKey: ['monitors'] });
    } finally {
      setCheckingId(null);
    }
  };

  // Metrics summary
  const totalMonitors = monitors.length;
  const activeMonitors = monitors.filter((m) => m.isActive).length;
  const upMonitors = monitors.filter((m) => m.isActive && m.currentStatus === 'UP').length;
  const downMonitors = monitors.filter((m) => m.isActive && m.currentStatus === 'DOWN').length;
  const suspectMonitors = monitors.filter(
    (m) => m.isActive && (m.currentStatus === 'SUSPECT' || m.currentStatus === 'RECOVERING')
  ).length;

  return (
    <div className="space-y-8">
      {/* Page Title & Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time status and health metrics for your monitored endpoints.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Monitor
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Monitors</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{totalMonitors}</p>
          <p className="text-xs text-gray-400 mt-1">{activeMonitors} active / {totalMonitors - activeMonitors} paused</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Operational</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{upMonitors}</p>
          <p className="text-xs text-emerald-700/80 mt-1">All systems normal</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Degraded / Glitch</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">{suspectMonitors}</p>
          <p className="text-xs text-amber-700/80 mt-1">Suspect or recovering</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Down / Alerting</p>
          <p className="text-2xl font-bold text-rose-600 mt-2">{downMonitors}</p>
          <p className="text-xs text-rose-700/80 mt-1">Requiring immediate attention</p>
        </div>
      </div>

      {/* Monitor List Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-base font-semibold text-gray-900">Your Monitors</h2>
          <span className="text-xs text-gray-400">Refreshes every 15s</span>
        </div>

        {isLoading && (
          <div className="p-12 text-center text-gray-400">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading monitors...
          </div>
        )}

        {error && (
          <div className="p-12 text-center text-red-500 text-sm">
            Failed to load monitors. Please check your connection.
          </div>
        )}

        {!isLoading && !error && monitors.length === 0 && (
          <div className="p-12 text-center">
            <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-800">No monitors configured yet</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1 mb-5">
              Start tracking your websites and APIs by registering your first monitor.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Add First Monitor
            </button>
          </div>
        )}

        {!isLoading && !error && monitors.length > 0 && (
          <div className="divide-y divide-gray-100">
            {monitors.map((monitor) => (
              <div
                key={monitor.id}
                className="p-5 sm:px-6 hover:bg-gray-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/monitors/${monitor.id}`}
                      className="font-semibold text-gray-900 hover:text-indigo-600 text-base transition-colors flex items-center gap-1 group"
                    >
                      {monitor.name}
                      <ArrowUpRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                    <StatusBadge status={monitor.currentStatus} isActive={monitor.isActive} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="truncate max-w-xs sm:max-w-md">{monitor.url}</span>
                    <span>&bull;</span>
                    <span>Every {monitor.intervalSeconds}s</span>
                    <span>&bull;</span>
                    <span>Timeout {monitor.timeoutMs}ms</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleManualCheck(monitor.id)}
                    disabled={checkingId === monitor.id}
                    title="Run manual probe now"
                    className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${checkingId === monitor.id ? 'animate-spin text-indigo-600' : ''}`}
                    />
                  </button>

                  {monitor.isActive ? (
                    <button
                      onClick={() => pauseMutation.mutate(monitor.id)}
                      disabled={pauseMutation.isPending}
                      title="Pause monitor"
                      className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => resumeMutation.mutate(monitor.id)}
                      disabled={resumeMutation.isPending}
                      title="Resume monitor"
                      className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete "${monitor.name}"?`)) {
                        deleteMutation.mutate(monitor.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    title="Delete monitor"
                    className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <Link
                    to={`/monitors/${monitor.id}`}
                    className="ml-2 text-xs font-semibold px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                  >
                    Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateMonitorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
