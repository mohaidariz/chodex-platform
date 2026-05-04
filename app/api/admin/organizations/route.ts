import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceClient = createServiceRoleClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!(profile as any)?.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, slug, notificationEmail } = await request.json();

  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: 'Slug must be lowercase letters, numbers, and hyphens only' },
      { status: 400 }
    );
  }

  const { data: existing } = await serviceClient
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });
  }

  const { data: org, error: orgError } = await serviceClient
    .from('organizations')
    .insert({
      name: name.trim(),
      slug,
      settings: {
        timezone: 'Europe/Stockholm',
        slot_duration_minutes: 30,
        notification_email: notificationEmail || user.email,
        status: 'active',
      },
    })
    .select()
    .single();

  if (orgError || !org) {
    return NextResponse.json(
      { error: orgError?.message || 'Failed to create organization' },
      { status: 500 }
    );
  }

  // Link creator as a member of the new org (skip on conflict — creator already has a profile)
  await serviceClient
    .from('profiles')
    .upsert(
      { id: user.id, org_id: org.id, email: user.email, role: 'admin' },
      { onConflict: 'id', ignoreDuplicates: true }
    );

  return NextResponse.json({ org });
}
