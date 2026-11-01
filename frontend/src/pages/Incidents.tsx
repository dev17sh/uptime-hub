import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getIncidentsApi } from '../api/incidents';
import type { Incident } from '../types';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
} from 'lucide-react';

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getIncidentsApi(
        statusFilter === 'ALL' ? undefined : { status: statusFilter }
      );
      setIncidents(data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message || 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [statusFilter]);

  const filteredIncidents = incidents.filter((incident) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const monitorName = incident.monitor?.name?.toLowerCase() || '';
    const monitorUrl = incident.monitor?.url?.toLowerCase() || '';
    const failureReason = incident.failureReason?.toLowerCase() || '';
    return (
      monitorName.includes(q) ||
      monitorUrl.includes(q) ||
      failureReason.includes(q) ||
      incident.id.toLowerCase().includes(q)
    );
  });

  const openCount = incidents.filter((i) => i.status === 'OPEN').length;
  const resolvedCount = incidents.filter((i) => i.status === 'RESOLVED').length;

  const formatDuration = (startedAt: string, resolvedAt?: string | null) => {
    if (!resolvedAt) return 'Ongoing';
    const diffMs = new Date(resolvedAt).getTime() - new Date(startedAt).getTime();
    if (diffMs <= 0) return '< 1s';
    const totalSecs = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const hours = Math.floor(mins / 60);

    if (hours > 0) {
      return `${hours}h ${mins % 60}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Incidents</h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time and historical incident tracking across all monitored services.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2">
          <button
            onClick={() => fetchIncidents()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-2xs hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white overflow-hidden rounded-xl border border-gray-200 p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Recorded</p>
              <p className="text-2xl font-bold text-gray-900">{incidents.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-xl border border-gray-200 p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-lg ${
                openCount > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Active Outages</p>
              <p
                className={`text-2xl font-bold ${
                  openCount > 0 ? 'text-red-600' : 'text-gray-900'
                }`}
              >
                {openCount}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-xl border border-gray-200 p-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Resolved</p>
              <p className="text-2xl font-bold text-gray-900">{resolvedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === 'ALL'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('OPEN')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === 'OPEN'
                ? 'bg-red-600 text-white shadow-2xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Open Outages
          </button>
          <button
            onClick={() => setStatusFilter('RESOLVED')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === 'RESOLVED'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Resolved
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search incidents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Incidents Table / List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
        {loading && incidents.length === 0 ? (
          <div className="py-16 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
            <p className="mt-2 text-sm text-gray-500">Loading incidents...</p>
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-base font-medium text-gray-900">No incidents found</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              {searchQuery
                ? 'No incidents match your current search query.'
                : 'All monitors are operating smoothly without incident events.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
              <thead className="bg-gray-50 font-medium text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Monitor</th>
                  <th className="px-6 py-3">Failure Reason</th>
                  <th className="px-6 py-3">Started At</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredIncidents.map((incident) => {
                  const isOpen = incident.status === 'OPEN';
                  return (
                    <tr key={incident.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isOpen ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                            Active Outage
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Resolved
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        {incident.monitor ? (
                          <div>
                            <Link
                              to={`/monitors/${incident.monitor.id}`}
                              className="font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                            >
                              {incident.monitor.name}
                            </Link>
                            <div className="text-gray-400 font-mono text-[11px] truncate max-w-xs">
                              {incident.monitor.url}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 font-mono text-[11px]">
                            {incident.monitorId}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                          {incident.failureReason || 'Unknown error'}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                        {new Date(incident.startedAt).toLocaleString()}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 font-medium">
                        {formatDuration(incident.startedAt, incident.resolvedAt)}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link
                          to={`/monitors/${incident.monitorId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          View Monitor <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
