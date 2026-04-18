import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import CopyButton from './CopyButton';

export default async function EmbedPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const serviceClient = createServiceRoleClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('org_id, organizations(slug)')
    .eq('id', user.id)
    .single();

  const slug = (profile as any)?.organizations?.slug || 'your-slug';
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://your-domain.com';

  const iframeCode = `<iframe
  src="${baseUrl}/chatbot/${slug}"
  style="position:fixed;bottom:0;right:0;width:400px;height:600px;border:none;z-index:9999;border-radius:16px 16px 0 0;box-shadow:0 -4px 30px rgba(0,0,0,0.15);"
  title="Chodex AI Assistant"
></iframe>`;

  const scriptCode = `<!-- Chodex AI Widget -->
<script>
  (function() {
    var iframe = document.createElement('iframe');
    iframe.src = '${baseUrl}/chatbot/${slug}';
    iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:400px;height:600px;border:none;z-index:9999;border-radius:16px 16px 0 0;box-shadow:0 -4px 30px rgba(0,0,0,0.15);';
    iframe.title = 'Chodex AI Assistant';
    document.body.appendChild(iframe);
  })();
</script>`;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Widget Embed</h2>
        <p className="text-gray-400 mt-1">Add the Chodex AI chatbot to any website</p>
      </div>

      <div className="space-y-6">
        {/* Preview link */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Preview your widget</h3>
          <a
            href={`/chatbot/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors text-sm font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            {baseUrl}/chatbot/{slug}
          </a>
        </div>

        {/* iframe embed */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300">iFrame embed</h3>
            <CopyButton text={iframeCode} />
          </div>
          <pre className="bg-gray-950 rounded-xl p-4 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
            {iframeCode}
          </pre>
        </div>

        {/* Script embed */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300">Script embed (recommended)</h3>
            <CopyButton text={scriptCode} />
          </div>
          <pre className="bg-gray-950 rounded-xl p-4 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
            {scriptCode}
          </pre>
          <p className="text-gray-500 text-xs mt-3">
            Paste this snippet before the closing <code className="text-gray-400">&lt;/body&gt;</code> tag of your website.
          </p>
        </div>

        {/* Org slug */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Your organization slug</h3>
          <code className="text-indigo-400 bg-gray-800 px-3 py-1.5 rounded-lg text-sm">{slug}</code>
        </div>
      </div>
    </div>
  );
}
