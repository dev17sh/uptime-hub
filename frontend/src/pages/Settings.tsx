import { useState, useEffect } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { getNotificationSettingsApi, updateNotificationSettingsApi } from '../api/settings';
import type { NotificationPreference } from '../types';
import {
  Bell,
  Mail,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  User,
  Shield,
  Save,
} from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreference>({
    emailEnabled: true,
    downtimeEnabled: true,
    recoveryEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        setErrorMessage(null);
        const data = await getNotificationSettingsApi();
        setPreferences(data);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: { message?: string } } } };
        setErrorMessage(e.response?.data?.error?.message || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleToggle = (key: keyof NotificationPreference) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const updated = await updateNotificationSettingsApi(preferences);
      setPreferences(updated);
      setSuccessMessage('Notification preferences saved successfully!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setErrorMessage(e.response?.data?.error?.message || 'Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Account Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account profile and incident alert dispatch preferences.
        </p>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <User className="w-5 h-5 text-gray-500" />
          <h2 className="text-base font-semibold text-gray-900">User Profile</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
                Full Name
              </label>
              <p className="mt-1 text-sm font-semibold text-gray-900">{user?.name || '—'}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email Address
              </label>
              <p className="mt-1 text-sm font-semibold text-gray-900">{user?.email || '—'}</p>
            </div>
          </div>
          <div className="pt-2 text-xs text-gray-500 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-emerald-600" />
            <span>Alert notifications are securely routed to your verified account email address.</span>
          </div>
        </div>
      </div>

      {/* Feedback Messages */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-800">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Notifications Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Incident Notifications</h2>
          </div>
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Loading...
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="divide-y divide-gray-100">
            {/* Master Switch: Email Enabled */}
            <div className="py-4 flex items-center justify-between">
              <div className="pr-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-gray-900">Email Alerts</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Master switch to enable or pause all outbound email notifications.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.emailEnabled}
                onClick={() => handleToggle('emailEnabled')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
                  preferences.emailEnabled ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    preferences.emailEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Downtime Alerts */}
            <div className="py-4 flex items-center justify-between">
              <div className="pr-4">
                <span className="text-sm font-semibold text-gray-900">Downtime Outage Alerts</span>
                <p className="mt-1 text-xs text-gray-500">
                  Send an email immediately when a monitor exceeds consecutive failure thresholds and enters DOWN state.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                disabled={!preferences.emailEnabled}
                aria-checked={preferences.downtimeEnabled}
                onClick={() => handleToggle('downtimeEnabled')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                  preferences.downtimeEnabled && preferences.emailEnabled
                    ? 'bg-red-600'
                    : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    preferences.downtimeEnabled && preferences.emailEnabled
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Recovery Alerts */}
            <div className="py-4 flex items-center justify-between">
              <div className="pr-4">
                <span className="text-sm font-semibold text-gray-900">Recovery Alerts</span>
                <p className="mt-1 text-xs text-gray-500">
                  Send an email when a service recovers back to UP, including complete outage duration calculations.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                disabled={!preferences.emailEnabled}
                aria-checked={preferences.recoveryEnabled}
                onClick={() => handleToggle('recoveryEnabled')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                  preferences.recoveryEnabled && preferences.emailEnabled
                    ? 'bg-emerald-600'
                    : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    preferences.recoveryEnabled && preferences.emailEnabled
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              disabled={loading || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Preferences
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
