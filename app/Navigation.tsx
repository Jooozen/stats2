'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

const tabs = [
  { href: '/', label: 'ホーム', icon: '🏠' },
  { href: '/teams', label: 'チーム', icon: '👥' },
  { href: '/games', label: '試合', icon: '🏀' },
];

export default function Navigation() {
  const pathname = usePathname();
  const { workspace } = useAuth();

  // スタッツ記録画面ではナビゲーションを非表示
  if (pathname.match(/^\/games\/\d+$/) && !pathname.endsWith('/summary')) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 z-50">
      <div className="max-w-7xl mx-auto flex justify-around">
        {tabs.map((tab) => {
          const isActive =
            tab.href === '/'
              ? pathname === '/'
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center py-3 px-6 text-sm min-w-[80px] ${
                isActive
                  ? 'text-orange-400 border-t-2 border-orange-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="text-xl mb-1">{tab.icon}</span>
              <span className="text-xs font-medium">{tab.label}</span>
            </Link>
          );
        })}
        {workspace && (
          <Link
            href="/account"
            className={`flex flex-col items-center py-3 px-4 text-sm min-w-[64px] ${
              pathname === '/account'
                ? 'text-orange-400 border-t-2 border-orange-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span className="text-xl mb-1">&#9881;</span>
            <span className="text-xs font-medium truncate max-w-[56px]">{workspace.name}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
