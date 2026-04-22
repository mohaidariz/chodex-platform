import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('org_id, organizations(timezone, slot_duration_minutes, cancellation_contact)')
      .eq('id', user.id)
      .single();

    const orgId = profile?.org_id;
    const org = (profile as any)?.organizations;

    const [{ data: rules }, { data: blackouts }] = await Promise.all([
      serviceClient
        .from('availability_rules')
        .select('*')
        .eq('org_id', orgId)
        .order('day_of_week'),
      serviceClient
        .from('availability_blackouts')
        .select('*')
        .eq('org_id', orgId)
        .order('start_at'),
    ]);

    return NextResponse.json({
      timezone: org?.timezone ?? 'Europe/Stockholm',
      slotDuration: org?.slot_duration_minutes ?? 30,
      cancellationContact: org?.cancellation_contact ?? '',
      rules: (rules || []).map((r: any) => ({
        dayOfWeek: r.day_of_week,
        startTime: r.start_time,
        endTime: r.end_time,
      })),
      blackouts: (blackouts || []).map((b: any) => ({
        id: b.id,
        startAt: b.start_at,
        endAt: b.end_at,
        reason: b.reason ?? '',
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const orgId = profile?.org_id;
    if (!orgId) return NextResponse.json({ error: 'Org not found' }, { status: 403 });

    const { timezone, slotDuration, cancellationContact, rules, blackouts } = await request.json();

    // Update org settings
    await serviceClient
      .from('organizations')
      .update({ timezone, slot_duration_minutes: slotDuration, cancellation_contact: cancellationContact || null })
      .eq('id', orgId);

    // Replace all availability rules
    await serviceClient.from('availability_rules').delete().eq('org_id', orgId);
    for (const rule of rules) {
      if (rule.enabled) {
        await serviceClient.from('availability_rules').insert({
          org_id: orgId,
          day_of_week: rule.dayOfWeek,
          start_time: rule.startTime,
          end_time: rule.endTime,
        });
      }
    }

    // Replace all blackouts
    await serviceClient.from('availability_blackouts').delete().eq('org_id', orgId);
    for (const bo of blackouts) {
      if (bo.startAt && bo.endAt) {
        await serviceClient.from('availability_blackouts').insert({
          org_id: orgId,
          start_at: new Date(bo.startAt).toISOString(),
          end_at: new Date(bo.endAt).toISOString(),
          reason: bo.reason || null,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
