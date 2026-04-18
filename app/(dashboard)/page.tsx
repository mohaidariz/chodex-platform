import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { FileText, MessageSquare, Mail, Brain } from 'lucide-react';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const serviceClient = createServiceRoleClient();
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  const orgId = profile?.org_id;
  let stats = { documents: 0, conversations: 0, messages: 0, learnings: 0 };

  if (orgId) {
    const [docs, convs, msgs, learns] = await Promise.all([
      serviceClient.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      serviceClient.from('conversations').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      serviceClient.from('messages').select('id', { count: 'exact', head: true }),
      serviceClient.from('learnings').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    ]);
    stats = {
      documents: docs.count || 0,
      conversations: convs.count || 0,
      messages: msgs.count || 0,
      learnings: learns.count || 0,
    };
  }

  const statCards = [
    { label: 'Documents', value: stats.documents, icon: FileText, color: 'indigo' },
    { label: 'Conversations', value: stats.conversations, icon: MessageSquare, color: 'emerald' },
    { label: 'Messages', value: stats.messages, icon: Mail, color: 'violet' },
    { label: 'Learnings', value: stats.learnings, icon: Brain, color: 'amber' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-gray-400 mt-1">Overview of your AI agent platform</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-gray-400">{card.label}</span>
                <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center">
                  <Icon className="w-5 h-5 text-indigo-400" />
                </div>
              </div>
              <p className="text-3xl font-bold text-white">{card.value.toLocaleString()}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Getting Started</h3>
        <ol className="space-y-3 text-gray-400 text-sm list-decimal list-inside">
          <li>Upload PDF documents in the <span className="text-indigo-400">Documents</span> section.</li>
          <li>Copy your widget embed code from the <span className="text-indigo-400">Widget</span> section.</li>
          <li>Paste the embed code on your website to add the AI chatbot.</li>
          <li>Monitor conversations in the <span className="text-indigo-400">Conversations</span> section.</li>
        </ol>
      </div>
    </div>
  );
}
