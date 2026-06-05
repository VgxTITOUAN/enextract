import { DRY_RUN } from '@/config/flags';

interface TopbarProps {
  title: string;
  userName: string;
}

export default function Topbar({ title, userName }: TopbarProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="text-sm font-bold text-gray-800">{title}</div>
      <div className="flex items-center gap-2.5">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            DRY_RUN ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
          title={DRY_RUN ? 'Pas d\'écriture dans Sellsy' : 'Écriture Sellsy active'}
        >
          {DRY_RUN ? 'DRY RUN' : 'LIVE'}
        </span>
        <span className="text-sm text-gray-500">{userName}</span>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: '#6bb100' }}
        >
          {userName.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}