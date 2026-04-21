import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAvailableSlots } from '@/lib/booking/availability';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgSlug = searchParams.get('orgSlug');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!orgSlug || !from) {
      return NextResponse.json({ error: 'Missing orgSlug or from parameter' }, { status: 400 });
    }

    const toDate = to || (() => {
      const d = new Date(from);
      d.setUTCDate(d.getUTCDate() + 13);
      return d.toISOString().slice(0, 10);
    })();

    const supabase = createServiceRoleClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, timezone')
      .eq('slug', orgSlug)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const slots = await getAvailableSlots(org.id, from, toDate);

    return NextResponse.json({
      slots,
      orgName: (org as any).name,
      timezone: (org as any).timezone ?? 'Europe/Stockholm',
    });
  } catch (error: any) {
    console.error('Availability check error:', error);
    return NextResponse.json({ error: error.message || 'Failed to get availability' }, { status: 500 });
  }
}
