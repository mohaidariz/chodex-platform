import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const user = data.user;
      const meta = user.user_metadata || {};
      const serviceClient = createServiceRoleClient();

      const { data: existing } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!existing) {
        let orgId: string | null = null;

        if (meta.org_name && meta.org_slug) {
          const { data: org } = await serviceClient
            .from('organizations')
            .insert({ name: meta.org_name, slug: meta.org_slug })
            .select()
            .single();
          orgId = org?.id || null;
        }

        await serviceClient.from('profiles').insert({
          id: user.id,
          org_id: orgId,
          full_name: meta.full_name || '',
          email: user.email || '',
          role: 'admin',
        });
      }

      return NextResponse.redirect(`${origin}/documents`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
