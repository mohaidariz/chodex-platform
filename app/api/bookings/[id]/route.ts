import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    const { data: booking } = await serviceClient
      .from('bookings')
      .select('id, org_id')
      .eq('id', params.id)
      .single();

    if (!booking || booking.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    await serviceClient
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', params.id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Booking cancel error:', error);
    return NextResponse.json({ error: error.message || 'Cancel failed' }, { status: 500 });
  }
}
