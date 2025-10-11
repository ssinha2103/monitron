import clsx from 'clsx';

type LogoProps = {
  orientation?: 'horizontal' | 'vertical';
  tagline?: boolean;
  size?: number;
  className?: string;
};

export function Logo({ orientation = 'horizontal', tagline = true, size = 36, className }: LogoProps) {
  return (
    <span className={clsx('logo', `logo-${orientation}`, className)}>
      <LogoMark size={size} />
      <span className="logo-wordmark">
        <strong>Monitron</strong>
        {tagline ? <small>Control Center</small> : null}
      </span>
    </span>
  );
}

export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx('logo-mark', className)}>
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="50%" stopColor="#1f2937" />
            <stop offset="100%" stopColor="#4b5563" />
          </linearGradient>
          <linearGradient id="logo-wave" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f9fafb" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.75" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#logo-gradient)" />
        <path
          d="M9 26c3.5 0 5.5-10 9-10s5.5 18 9 18 5.5-12 9-12 5.5 6 9 6"
          stroke="url(#logo-wave)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M9 20c3.5 0 5.5-6 9-6s5.5 10 9 10 5.5-8 9-8 5.5 4 9 4"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="13" cy="18" r="2.5" fill="rgba(255,255,255,0.8)" />
        <circle cx="23" cy="30" r="2" fill="rgba(255,255,255,0.85)" />
        <circle cx="33" cy="22" r="2.2" fill="rgba(255,255,255,0.8)" />
      </svg>
    </span>
  );
}
