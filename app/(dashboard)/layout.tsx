import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { LayoutDashboard, FileText, MessageSquare, Code2, Settings, CalendarDays } from 'lucide-react';
import { SignOutButton } from './components/SignOutButton';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/embed', label: 'Widget', icon: Code2 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const serviceClient = createServiceRoleClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('*, organizations(*)')
    .eq('id', user.id)
    .single();

  const orgName = (profile as any)?.organizations?.name || 'Your Organization';

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <aside className="w-64 flex flex-col bg-gray-900 border-r border-gray-800 shrink-0">
        <div className="px-6 py-5 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white">Chodex</h1>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{orgName}</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors group"
              >
                <Icon className="w-4 h-4 group-hover:text-indigo-400 transition-colors" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-gray-800">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
