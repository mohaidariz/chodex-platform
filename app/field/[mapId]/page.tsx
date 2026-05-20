import { redirect } from 'next/navigation';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import FieldView from './FieldView';

/**
 * GET /field/[mapId]
 *
 * Mobile-optimized field view for crews on site. Shows the PDF overlay
 * positioned in the real world, the user's current GPS position, and the
 * features nearest to them. v1 is dashboard-authenticated; public/shared
 * access can come later via a token.
 */
export default async function FieldPage({ params }: { params: { mapId: string } }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const service = createServiceRoleClient();

  const { data: profile } = await service
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.org_id) redirect('/');

  const { data: map } = await service
    .from('maps')
    .select('*')
    .eq('id', params.mapId)
    .single();
  if (!map || map.org_id !== profile.org_id) redirect('/maps');

  const [{ data: pages }, { data: features }] = await Promise.all([
    service
      .from('map_pages')
      .select('*')
      .eq('map_id', params.mapId)
      .order('page_number'),
    service
      .from('map_features')
      .select('*')
      .eq('map_id', params.mapId)
      .order('page_number'),
  ]);

  return (
    <FieldView
      map={map}
      pages={pages ?? []}
      features={features ?? []}
    />
  );
}
