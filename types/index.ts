export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  settings: Record<string, any>;
}

export interface Profile {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

export interface Document {
  id: string;
  org_id: string;
  name: string;
  file_path: string;
  file_type: string;
  status: 'pending' | 'processing' | 'processed' | 'error';
  chunk_count: number;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  org_id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  created_at: string;
}

export interface Conversation {
  id: string;
  org_id: string;
  visitor_name?: string;
  visitor_email?: string;
  status: 'active' | 'resolved' | 'escalated';
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface Learning {
  id: string;
  org_id: string;
  conversation_id: string;
  question: string;
  answer: string;
  helpful: boolean;
  created_at: string;
}

export interface EmailLog {
  id: string;
  org_id: string;
  conversation_id?: string;
  to_email: string;
  from_name: string;
  from_email: string;
  subject: string;
  body: string;
  status: 'sent' | 'failed';
  created_at: string;
}
