import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Map as MapIcon, CheckCircle, Crosshair, FileText } from 'lucide-react';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const serviceClient = createServiceRoleClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.org_id;
  let stats = { maps: 0, ready: 0, features: 0, calibratedPages: 0 };

  if (orgId) {
    const [mapsRes, readyRes, featuresRes, calibratedRes] = await Promise.all([
      serviceClient.from('maps').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      serviceClient
        .from('maps')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'ready'),
      serviceClient
        .from('map_features')
        .select('id, maps!inner(org_id)', { count: 'exact', head: true })
        .eq('maps.org_id', orgId),
      serviceClient
        .from('map_pages')
        .select('id, maps!inner(org_id)', { count: 'exact', head: true })
        .eq('maps.org_id', orgId)
        .not('calibration', 'is', null),
    ]);

    stats = {
      maps: mapsRes.count || 0,
      ready: readyRes.count || 0,
      features: featuresRes.count || 0,
      calibratedPages: calibratedRes.count || 0,
    };
  }

  const statCards = [
    { label: 'Maps uploaded', value: stats.maps, icon: MapIcon },
    { label: 'Ready maps', value: stats.ready, icon: CheckCircle },
    { label: 'Calibrated pages', value: stats.calibratedPages, icon: Crosshair },
    { label: 'Extracted features', value: stats.features, icon: FileText },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-gray-400 mt-1">
          Field-map agent for utility crews. Upload a Byggkarta or Borrkarta, calibrate
          its pages, and crews can open it on iPad with GPS-aware answers about what is
          near them.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-gray-400">{card.label}</span>
                <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center">
                  <Icon className="w-5 h-5 text-indigo-400" />
                </div>
              </div>
              <p className="text-3xl font-bold text-white">{card.value.toLocaleString()}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Getting started</h3>
        <ol className="space-y-3 text-gray-400 text-sm list-decimal list-inside">
          <li>
            Go to <Link href="/maps" className="text-indigo-400 hover:text-indigo-300">Field maps</Link>{' '}
            and upload a Byggkarta or Borrkarta PDF.
          </li>
          <li>Wait for status to flip from <em>extracting</em> to <em>ready</em>.</li>
          <li>Open the map, click <em>Calibrate</em>, anchor each detail page to OpenStreetMap.</li>
          <li>Click <em>Open field view</em> to hand it to the crew on iPad. Their GPS position
            shows on the map and the agent answers questions about what is nearby.</li>
        </ol>
      </div>
    </div>
  );
}
