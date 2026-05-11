import Link from 'next/link';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import LogoutButton from '@/components/LogoutButton';

const navItems = [
  { href: '/extraction', label: 'Extraction', icon: '📝' },
  { href: '/planification',  label: 'Planification',  icon: '📅' },
  { href: '/telechargement', label: 'Téléchargement', icon: '⬇️' },
];

const adminItems = [
  { href: '/droits', label: "Droits d'accès", icon: '👥' },
];

interface SidebarProps {
  userName: string;
  userRole: string;
  currentPath: string;
}

export default function Sidebar({ userName, userRole, currentPath }: SidebarProps) {
  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-200 flex flex-col">

      {/* Logo */}
      <div className="p-4 border-b border-gray-200 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
          style={{ backgroundColor: '#6bb100' }}
        >
          E
        </div>
        <span className="font-bold text-gray-800 text-base tracking-tight">EneXtract</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 pt-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-3 mb-2">
          Navigation
        </p>
        <ul className="space-y-0.5">
          {navItems.map(item => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border-l-2 ${
                  currentPath === item.href
                    ? 'border-[#6bb100] bg-green-50 text-[#4a7c00]'
                    : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}

          {userRole === 'admin' && (
            <>
              <li className="pt-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-3 mb-2">
                  Admin
                </p>
              </li>
              {adminItems.map(item => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border-l-2 ${
                      currentPath === item.href
                        ? 'border-[#6bb100] bg-green-50 text-[#4a7c00]'
                        : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </>
          )}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: '#f0f9e8', color: '#4a7c00' }}
          >
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{userName}</p>
            <p className="text-xs text-gray-400 capitalize">{userRole}</p>
          </div>
        </div>
        <LogoutButton />
      </div>

    </aside>
  );
}