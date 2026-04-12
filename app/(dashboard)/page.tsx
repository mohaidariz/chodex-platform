import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { FileText, MessageSquare, Lightbulb, Mail, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, full_name, role')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    redirect('/signup')
  }

  const orgId = profile.org_id

  // Parallel data fetch
  const [
    { count: documentsCount },
    { count: conversationsCount },
    { count: messagesCount },
    { count: learningsCount },
    { data: recentDocs },
    { data: recentConvs },
  ] = await Promise.all([
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase
      .from('messages')
      .select('*, conversations!inner(org_id)', { count: 'exact', head: true })
      .eq('conversations.org_id', orgId),
    supabase.from('learnings').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase
      .from('documents')
      .select('id, name, status, created_at, file_type')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('conversations')
      .select('id, session_id, visitor_email, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const firstName = profile.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Good morning, {firstName} 👋</h1>
        <p className="text-slate-500 text-sm mt-1">Here&apos;s what&apos;s happening with your AI assistant.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Documents"
          value={documentsCount ?? 0}
          icon={FileText}
          description="Indexed knowledge base"
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <StatsCard
          title="Conversations"
          value={conversationsCount ?? 0}
          icon={MessageSquare}
          description="Total chat sessions"
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
        />
        <StatsCard
          title="Messages"
          value={messagesCount ?? 0}
          icon={Mail}
          description="Questions answered"
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
        <StatsCard
          title="Learnings"
          value={learningsCount ?? 0}
          icon={Lightbulb}
          description="Insights extracted"
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent documents */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Recent Documents</h2>
            <Link
              href="/dashboard/documents"
              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {!recentDocs?.length ? (
            <div className="text-center py-8">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No documents yet</p>
              <Link href="/dashboard/documents" className="text-sm text-blue-600 mt-1 inline-block hover:underline">
                Upload your first document →
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentDocs.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-sm flex-shrink-0">
                    {doc.file_type === 'pdf' ? '📄' : doc.file_type === 'docx' ? '📝' : '📃'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{doc.name}</p>
                    <p className="text-xs text-slate-400">{formatDate(doc.created_at)}</p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      doc.status === 'ready'
                        ? 'bg-green-100 text-green-700'
                        : doc.status === 'processing'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {doc.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent conversations */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Recent Conversations</h2>
            <Link
              href="/dashboard/conversations"
              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {!recentConvs?.length ? (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No conversations yet</p>
              <Link href="/dashboard/embed" className="text-sm text-blue-600 mt-1 inline-block hover:underline">
                Get your embed code →
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentConvs.map((conv) => (
                <li key={conv.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-sm flex-shrink-0">
                    💬
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {conv.visitor_email ?? 'Anonymous visitor'}
                    </p>
                    <p className="text-xs text-slate-400">{formatDate(conv.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
