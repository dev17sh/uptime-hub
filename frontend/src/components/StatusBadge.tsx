import type { MonitorStatus } from '../types';

interface StatusBadgeProps {
  status: MonitorStatus;
  isActive?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function StatusBadge({ status, isActive = true, size = 'md' }: StatusBadgeProps) {
  if (!isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Paused
      </span>
    );
  }

  const configs: Record<
    MonitorStatus,
    { label: string; bg: string; text: string; dot: string; border: string; pulse?: boolean }
  > = {
    UP: {
      label: 'Operational',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      dot: 'bg-emerald-500',
      border: 'border-emerald-200',
    },
    SUSPECT: {
      label: 'Suspect',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      dot: 'bg-amber-500',
      border: 'border-amber-200',
      pulse: true,
    },
    DOWN: {
      label: 'Downtime',
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      dot: 'bg-rose-500',
      border: 'border-rose-200',
      pulse: true,
    },
    RECOVERING: {
      label: 'Recovering',
      bg: 'bg-sky-50',
      text: 'text-sky-700',
      dot: 'bg-sky-500',
      border: 'border-sky-200',
      pulse: true,
    },
  };

  const config = configs[status] || configs.UP;
  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs'
      : size === 'lg'
      ? 'px-3 py-1 text-sm'
      : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium border ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
    >
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.dot}`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dot}`} />
      </span>
      {config.label}
    </span>
  );
}

