-- Enable pgvector
create extension if not exists vector with schema extensions;

-- Organizations
create table public.organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,
  settings jsonb default '{}',
  created_at timestamptz default now()
);

-- Profiles
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  org_id uuid references public.organizations on delete cascade,
  full_name text,
  email text,
  role text default 'admin',
  created_at timestamptz default now()
);

-- Documents
create table public.documents (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations on delete cascade not null,
  name text not null,
  file_path text not null,
  file_type text default 'pdf',
  status text default 'pending' check (status in ('pending','processing','processed','error')),
  chunk_count integer default 0,
  created_at timestamptz default now()
);

-- Document chunks with vector embeddings
create table public.document_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references public.documents on delete cascade not null,
  org_id uuid references public.organizations on delete cascade not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Conversations
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations on delete cascade not null,
  visitor_name text,
  visitor_email text,
  status text default 'active' check (status in ('active','resolved','escalated')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Messages
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations on delete cascade not null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Learnings
create table public.learnings (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations on delete cascade not null,
  conversation_id uuid references public.conversations on delete cascade,
  question text not null,
  answer text not null,
  helpful boolean default true,
  created_at timestamptz default now()
);

-- Email logs
create table public.email_logs (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations on delete cascade not null,
  conversation_id uuid references public.conversations on delete cascade,
  to_email text not null,
  from_name text not null,
  from_email text not null,
  subject text not null,
  body text not null,
  status text default 'sent' check (status in ('sent','failed')),
  created_at timestamptz default now()
);

-- Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

-- Vector similarity search function
create or replace function match_chunks(
  query_embedding vector(1536),
  match_org_id uuid,
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.org_id = match_org_id
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Index for vector search
create index if not exists document_chunks_embedding_idx on document_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RLS
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table learnings enable row level security;
alter table email_logs enable row level security;

-- Organization policies
create policy "Users can view own org" on organizations
  for select using (id in (select org_id from profiles where id = auth.uid()));
create policy "Users can insert org" on organizations
  for insert with check (true);

-- Profile policies
create policy "Users can view own profile" on profiles
  for select using (id = auth.uid());
create policy "Users can insert own profile" on profiles
  for insert with check (id = auth.uid());
create policy "Users can update own profile" on profiles
  for update using (id = auth.uid());

-- Document policies
create policy "Users can view org documents" on documents
  for select using (org_id in (select org_id from profiles where id = auth.uid()));
create policy "Users can insert org documents" on documents
  for insert with check (org_id in (select org_id from profiles where id = auth.uid()));
create policy "Users can update org documents" on documents
  for update using (org_id in (select org_id from profiles where id = auth.uid()));
create policy "Users can delete org documents" on documents
  for delete using (org_id in (select org_id from profiles where id = auth.uid()));

-- Document chunk policies
create policy "Users can view org chunks" on document_chunks
  for select using (org_id in (select org_id from profiles where id = auth.uid()));
create policy "Service can insert chunks" on document_chunks
  for insert with check (true);

-- Conversation policies
create policy "Anyone can create conversations" on conversations
  for insert with check (true);
create policy "Users can view org conversations" on conversations
  for select using (org_id in (select org_id from profiles where id = auth.uid()));
create policy "Anyone can update conversations" on conversations
  for update using (true);

-- Message policies
create policy "Anyone can insert messages" on messages
  for insert with check (true);
create policy "Users can view org messages" on messages
  for select using (
    conversation_id in (
      select id from conversations
      where org_id in (select org_id from profiles where id = auth.uid())
    )
  );

-- Learning policies
create policy "Service can insert learnings" on learnings
  for insert with check (true);
create policy "Users can view org learnings" on learnings
  for select using (org_id in (select org_id from profiles where id = auth.uid()));

-- Email log policies
create policy "Service can insert email logs" on email_logs
  for insert with check (true);
create policy "Users can view org email logs" on email_logs
  for select using (org_id in (select org_id from profiles where id = auth.uid()));

-- Storage policies
create policy "Org members can upload" on storage.objects
  for insert with check (bucket_id = 'documents');
create policy "Org members can read" on storage.objects
  for select using (bucket_id = 'documents');

-- Trigger for new user (placeholder)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
