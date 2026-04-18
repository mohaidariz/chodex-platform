import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function SettingsPage() {
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

  const org = (profile as any)?.organizations;

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-gray-400 mt-1">Manage your organization and account</p>
      </div>

      <div className="space-y-6">
        {/* Organization */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-5">
            Organization
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Name</label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm">
                {org?.name || '—'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Slug</label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm font-mono">
                {org?.slug || '—'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Organization ID</label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-500 text-xs font-mono">
                {org?.id || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-5">
            Account
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Full name</label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm">
                {profile?.full_name || '—'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm">
                {user.email}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Role</label>
              <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full text-indigo-400 bg-indigo-400/10">
                {profile?.role || 'admin'}
              </span>
            </div>
          </div>
        </div>

        {/* Danger */}
        <div className="bg-gray-900 border border-red-900/40 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-2">
            Danger Zone
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            Once you delete your organization, all data will be permanently removed.
          </p>
          <button
            disabled
            className="bg-red-600/20 text-red-400 border border-red-600/30 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed opacity-50"
          >
            Delete organization (coming soon)
          </button>
        </div>
      </div>
    </div>
  );
}
