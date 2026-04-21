import { redirect } from 'next/navigation';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import BookingsView from './BookingsView';

export default async function BookingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const serviceClient = createServiceRoleClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('org_id, organizations(slug, name, timezone)')
    .eq('id', user.id)
    .single();

  const orgId = profile?.org_id;
  const org = (profile as any)?.organizations;

  const { data: bookings } = await serviceClient
    .from('bookings')
    .select('*')
    .eq('org_id', orgId)
    .order('start_at', { ascending: true });

  return (
    <BookingsView
      bookings={bookings || []}
      orgSlug={org?.slug || ''}
      orgTimezone={org?.timezone || 'Europe/Stockholm'}
    />
  );
}
