'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X, LayoutDashboard, Map as MapIcon, Settings, ShieldCheck, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/maps', label: 'Projects', icon: MapIcon },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function MobileTopBar({
  orgName,
  userEmail,
  isSuperAdmin,
}: {
  orgName: string;
  userEmail: string;
  isSuperAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <>
      {/* Mobile top bar — fixed to the top of the viewport, only below md.
          Adds the iPhone safe-area inset so it doesn't sit under the
          notch / Dynamic Island. */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 px-4 border-b border-gray-800 bg-black flex items-center justify-between z-30"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          height: 'calc(3rem + env(safe-area-inset-top, 0px))',
        }}
      >
        <button
          onClick={() => setOpen(true)}
          className="p-2 -ml-2 text-gray-300 hover:text-white"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <h1 className="text-sm font-bold text-white">Norrplex</h1>
        <div className="w-9" />
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/70 z-40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={`md:hidden fixed top-0 left-0 bottom-0 w-72 bg-black border-r border-gray-800 z-50 flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white">Norrplex</h1>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{orgName}</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-2 text-gray-400 hover:text-white"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <Icon className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}

          {isSuperAdmin && (
            <>
              <div className="my-2 mx-3 border-t border-gray-800" />
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-amber-400 hover:bg-amber-400/10 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="text-sm font-medium">Admin</span>
              </Link>
            </>
          )}
        </nav>

        <div className="px-3 py-4 border-t border-gray-800">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs text-gray-500 truncate">{userEmail}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
