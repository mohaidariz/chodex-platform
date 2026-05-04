import { redirect } from 'next/navigation';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import AdminView, { type OrgWithMetrics } from './AdminView';

export const dynamic = 'force-dynamic';

function groupByOrgId(rows: { org_id: string }[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows ?? []) {
    if (row.org_id) map[row.org_id] = (map[row.org_id] || 0) + 1;
  }
  return map;
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

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [
    { data: orgs },
    { data: allDocs },
    { data: allConvs },
    { data: monthConvs },
    { data: allBookings },
    { data: monthBookings },
    { data: monthAgentMsgs },
  ] = await Promise.all([
    serviceClient.from('organizations').select('*').order('created_at', { ascending: false }),
    serviceClient.from('documents').select('org_id'),
    serviceClient.from('conversations').select('org_id'),
    serviceClient.from('conversations').select('org_id').gte('created_at', monthStart),
    serviceClient.from('bookings').select('org_id'),
    serviceClient.from('bookings').select('org_id').gte('created_at', monthStart),
    serviceClient
      .from('messages')
      .select('conversations!inner(org_id)')
      .eq('role', 'assistant')
      .gte('created_at', monthStart),
  ]);

  const docsByOrg = groupByOrgId(allDocs ?? []);
  const monthConvsByOrg = groupByOrgId(monthConvs ?? []);
  const monthBookingsByOrg = groupByOrgId(monthBookings ?? []);

  // Agent calls: org_id is nested in the joined conversations row
  const agentCallsByOrg: Record<string, number> = {};
  for (const msg of monthAgentMsgs ?? []) {
    const orgId = (msg as any).conversations?.org_id;
    if (orgId) agentCallsByOrg[orgId] = (agentCallsByOrg[orgId] || 0) + 1;
  }

  const orgsWithMetrics: OrgWithMetrics[] = (orgs ?? []).map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    created_at: org.created_at,
    docCount: docsByOrg[org.id] || 0,
    monthConvCount: monthConvsByOrg[org.id] || 0,
    monthBookingCount: monthBookingsByOrg[org.id] || 0,
    monthAgentCalls: agentCallsByOrg[org.id] || 0,
  }));

  const stats = {
    totalOrgs: orgs?.length ?? 0,
    totalConversations: allConvs?.length ?? 0,
    totalBookings: allBookings?.length ?? 0,
    totalDocuments: allDocs?.length ?? 0,
  };

  return (
    <>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <AdminView
        initialOrgs={orgsWithMetrics}
        stats={stats}
        userEmail={user.email ?? ''}
      />
    </>
  );
}
