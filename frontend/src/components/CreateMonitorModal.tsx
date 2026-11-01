import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createMonitorApi } from '../api/monitors';
import type { CreateMonitorInput } from '../types';
import axios from 'axios';

interface CreateMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateMonitorModal({ isOpen, onClose }: CreateMonitorModalProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [timeoutMs, setTimeoutMs] = useState(10000);
  const [failureThreshold, setFailureThreshold] = useState(2);
  const [recoveryThreshold, setRecoveryThreshold] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: CreateMonitorInput) => createMonitorApi(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors'] });
      onClose();
      // Reset form
      setName('');
      setUrl('');
      setError(null);
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError('Failed to create monitor. Please check your parameters.');
      }
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    mutation.mutate({
      name,
      url,
      method: 'GET',
      intervalSeconds,
      timeoutMs,
      failureThreshold,
      recoveryThreshold,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-gray-100 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold text-gray-900">Add New Monitor</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monitor Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Production API"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Endpoint URL
            </label>
            <input
              type="url"
              required
              placeholder="https://api.example.com/health"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">Must be http:// or https:// (SSRF protected)</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Interval (sec)
              </label>
              <input
                type="number"
                min={30}
                max={86400}
                required
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">Min: 30s</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timeout (ms)
              </label>
              <input
                type="number"
                min={1000}
                max={30000}
                step={500}
                required
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">Max: 30,000ms</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fail Threshold (k)
              </label>
              <input
                type="number"
                min={1}
                max={10}
                required
                value={failureThreshold}
                onChange={(e) => setFailureThreshold(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">Consecutive fails to trigger DOWN</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recovery Threshold (r)
              </label>
              <input
                type="number"
                min={1}
                max={10}
                required
                value={recoveryThreshold}
                onChange={(e) => setRecoveryThreshold(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">Consecutive oks to resolve UP</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-2xs"
            >
              {mutation.isPending ? 'Saving...' : 'Create Monitor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
