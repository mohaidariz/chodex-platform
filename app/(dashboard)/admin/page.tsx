import { redirect } from 'next/navigation';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import AdminView, { type OrgWithMetrics } from './AdminView';

export const dynamic = 'force-dynamic';

function groupByOrgId(rows: { org_id: string }[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const row of rows ?? []) {
    if (row.org_id) m[row.org_id] = (m[row.org_id] || 0) + 1;
  }
  return m;
}

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const serviceClient = createServiceRoleClient();

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();
  if (!(profile as any)?.is_super_admin) redirect('/');

  const [{ data: orgs }, { data: allMaps }, { data: allFeatures }] = await Promise.all([
    serviceClient.from('organizations').select('*').order('created_at', { ascending: false }),
    serviceClient.from('maps').select('org_id, status'),
    serviceClient.from('map_features').select('id, maps!inner(org_id)'),
  ]);

  const mapsByOrg = groupByOrgId(allMaps ?? []);
  const readyByOrg = groupByOrgId((allMaps ?? []).filter((m: any) => m.status === 'ready'));

  // Map features inherit org_id through the joined map. Count per org.
  const featuresByOrg: Record<string, number> = {};
  for (const f of allFeatures ?? []) {
    const orgId = (f as any).maps?.org_id;
    if (orgId) featuresByOrg[orgId] = (featuresByOrg[orgId] || 0) + 1;
  }

  const orgsWithMetrics: OrgWithMetrics[] = (orgs ?? []).map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    created_at: org.created_at,
    mapCount: mapsByOrg[org.id] || 0,
    readyMapCount: readyByOrg[org.id] || 0,
    featureCount: featuresByOrg[org.id] || 0,
  }));

  const stats = {
    totalOrgs: orgs?.length ?? 0,
    totalMaps: allMaps?.length ?? 0,
    totalFeatures: allFeatures?.length ?? 0,
  };

  return (
    <AdminView
      initialOrgs={orgsWithMetrics}
      stats={stats}
      userEmail={user.email ?? ''}
    />
  );
}
