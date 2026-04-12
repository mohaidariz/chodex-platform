import { createServiceClient } from '@/lib/supabase/server'
import { ChatWidget } from '@/components/chat/ChatWidget'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

interface Props {
  params: { orgSlug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServiceClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('slug', params.orgSlug)
    .single()

  return {
    title: org ? `${org.name} AI Assistant` : 'AI Assistant',
    description: `Chat with ${org?.name ?? 'our'} AI assistant`,
  }
}

export default async function ChatbotPage({ params }: Props) {
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', params.orgSlug)
    .single()

  if (!org) {
    notFound()
  }

  return (
    <div className="h-screen w-screen bg-white flex flex-col">
      <ChatWidget orgSlug={org.slug} orgName={org.name} />
    </div>
  )
}
