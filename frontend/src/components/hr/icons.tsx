/* Compact HR icon set — ported 1:1 from hr-helpers.jsx in the design handoff.
 * All icons follow the same stroke conventions so pill/button sizing stays
 * consistent with the prototype.
 */
import type { ReactNode } from 'react'

function I({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const Icons = {
  search: (s?: number) => <I size={s}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>,
  x: (s?: number) => <I size={s}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></I>,
  plus: (s?: number) => <I size={s}><path d="M12 5v14" /><path d="M5 12h14" /></I>,
  down: (s?: number) => <I size={s}><path d="m6 9 6 6 6-6" /></I>,
  sort: (s?: number) => <I size={s}><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></I>,
  sortUp: (s?: number) => <I size={s}><path d="m7 15 5-5 5 5" /></I>,
  sortDn: (s?: number) => <I size={s}><path d="m7 9 5 5 5-5" /></I>,
  left: (s?: number) => <I size={s}><path d="m15 18-6-6 6-6" /></I>,
  right: (s?: number) => <I size={s}><path d="m9 18 6-6-6-6" /></I>,
  eye: (s?: number) => <I size={s}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></I>,
  eyeOff: (s?: number) => (
    <I size={s}>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </I>
  ),
  edit: (s?: number) => <I size={s}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" /></I>,
  more: (s?: number) => <I size={s}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></I>,
  user: (s?: number) => <I size={s}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></I>,
  users: (s?: number) => (
    <I size={s}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </I>
  ),
  userX: (s?: number) => (
    <I size={s}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="m17 8 5 5" />
      <path d="m22 8-5 5" />
    </I>
  ),
  clock: (s?: number) => <I size={s}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></I>,
  calendar: (s?: number) => <I size={s}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></I>,
  download: (s?: number) => <I size={s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></I>,
  back: (s?: number) => <I size={s}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></I>,
  file: (s?: number) => <I size={s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><polyline points="14 2 14 8 20 8" /></I>,
  sun: (s?: number) => <I size={s}><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></I>,
  moon: (s?: number) => <I size={s}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" /></I>,
  phone: (s?: number) => <I size={s}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></I>,
  building: (s?: number) => <I size={s}><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 22v-4h6v4" /></I>,
  briefcase: (s?: number) => <I size={s}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></I>,
  wallet: (s?: number) => <I size={s}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></I>,
  info: (s?: number) => <I size={s}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></I>,
  check: (s?: number) => <I size={s}><polyline points="20 6 9 17 4 12" /></I>,
  alert: (s?: number) => <I size={s}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></I>,
  logout: (s?: number) => <I size={s}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></I>,
}
