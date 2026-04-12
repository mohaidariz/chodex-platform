export interface Organization {
  id: string
  name: string
  slug: string
  email_from: string | null
  email_reply_to: string | null
  plan: 'free' | 'pro' | 'enterprise'
  created_at: string
}

export interface Profile {
  id: string
  org_id: string | null
  full_name: string | null
  role: 'owner' | 'admin' | 'member'
  created_at: string
}

export interface Document {
  id: string
  org_id: string
  name: string
  file_path: string | null
  file_type: string | null
  status: 'processing' | 'ready' | 'error'
  created_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  org_id: string
  content: string
  embedding: number[] | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface Conversation {
  id: string
  org_id: string
  session_id: string
  visitor_email: string | null
  created_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  sources: ChunkSource[] | null
  created_at: string
}

export interface Learning {
  id: string
  org_id: string
  conversation_id: string | null
  learning_type: string | null
  content: string
  applied: boolean
  created_at: string
}

export interface EmailLog {
  id: string
  org_id: string
  conversation_id: string | null
  to_email: string
  subject: string | null
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  created_at: string
}

export interface ChunkSource {
  id: string
  content: string
  metadata: Record<string, unknown> | null
  similarity: number
}

export interface ChatRequest {
  message: string
  orgSlug: string
  sessionId: string
  visitorEmail?: string
  conversationId?: string
}

export interface ChatResponse {
  content: string
  conversationId: string
  sources: ChunkSource[]
}

export interface UploadDocumentRequest {
  orgId: string
  file: File
}

export interface DashboardStats {
  documentsCount: number
  conversationsCount: number
  messagesCount: number
  learningsCount: number
}

export interface SidebarItem {
  label: string
  href: string
  icon: string
}
