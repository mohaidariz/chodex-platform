'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Code2, Copy, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function EmbedPage() {
  const [orgSlug, setOrgSlug] = useState('')
  const [copied, setCopied] = useState(false)
  const supabase = createClient()

  const fetchOrg = useCallback(async () => {
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile?.org_id) return

    const { data: org } = await supabase
      .from('organizations')
      .select('slug')
      .eq('id', profile.org_id)
      .single()

    if (org) setOrgSlug(org.slug)
  }, [supabase])

  useEffect(() => {
    fetchOrg()
  }, [fetchOrg])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://chodex.se'
  const chatbotUrl = `${appUrl}/chatbot/${orgSlug}`

  const iframeSnippet = `<!-- Chodex AI Assistant Widget -->
<iframe
  src="${chatbotUrl}"
  width="400"
  height="600"
  frameborder="0"
  style="border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); position: fixed; bottom: 24px; right: 24px; z-index: 9999;"
  title="AI Assistant"
  allow="autoplay"
></iframe>`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(iframeSnippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Code2 className="w-6 h-6 text-blue-600" />
          Embed Widget
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Add your AI assistant to any website with this embed code.
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Preview link */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-900 mb-2">Your chatbot URL</h2>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 font-mono text-sm text-slate-700 truncate">
              {chatbotUrl}
            </div>
            <a
              href={chatbotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              Open
            </a>
          </div>
        </div>

        {/* Embed code */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Embed code</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Paste this snippet before the closing <code className="bg-slate-100 px-1 rounded text-xs">&lt;/body&gt;</code> tag.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="flex items-center gap-2"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy code'}
            </Button>
          </div>
          <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs overflow-x-auto leading-relaxed">
            <code>{iframeSnippet}</code>
          </pre>
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Integration guide</h2>
          <ol className="space-y-4 text-sm text-slate-600">
            {[
              {
                n: 1,
                title: 'Upload your documents',
                desc: 'Go to Documents and upload your PDFs, Word docs, or text files. The AI learns from these.',
              },
              {
                n: 2,
                title: 'Copy the embed code',
                desc: 'Copy the iframe snippet above and paste it into your website\'s HTML.',
              },
              {
                n: 3,
                title: 'Customize (optional)',
                desc: 'Adjust the width, height, and position in the iframe style attribute to match your design.',
              },
              {
                n: 4,
                title: 'Go live',
                desc: 'That\'s it! Your AI assistant is now live on your website.',
              },
            ].map(({ n, title, desc }) => (
              <li key={n} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {n}
                </div>
                <div>
                  <p className="font-medium text-slate-800">{title}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Live preview */}
        {orgSlug && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Live preview</h2>
            <div className="flex justify-center">
              <div className="border-4 border-slate-300 rounded-2xl overflow-hidden shadow-xl" style={{ width: 380, height: 560 }}>
                <iframe
                  src={chatbotUrl}
                  width="380"
                  height="560"
                  className="border-0"
                  title="Chatbot preview"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
