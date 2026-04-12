-- Enable pgvector
create extension if not exists vector;

-- Organizations (tenants)
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  email_from text,
  email_reply_to text,
  plan text default 'free',
  created_at timestamptz default now()
);

-- Users
create table profiles (
  id uuid primary key references auth.users,
  org_id uuid references organizations(id),
  full_name text,
  role text default 'member',
  created_at timestamptz default now()
);

-- Documents
create table documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  file_path text,
  file_type text,
  status text default 'processing',
  created_at timestamptz default now()
);

-- Document chunks with embeddings
create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz default now()
);

-- Conversations
create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  session_id text not null,
  visitor_email text,
  created_at timestamptz default now()
);

-- Messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb,
  created_at timestamptz default now()
);

-- Learnings extracted from conversations
create table learnings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  conversation_id uuid references conversations(id),
  learning_type text,
  content text not null,
  applied boolean default false,
  created_at timestamptz default now()
);

-- Email logs
create table email_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  conversation_id uuid references conversations(id),
  to_email text not null,
  subject text,
  status text default 'pending',
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- Indexes
create index on document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index on document_chunks (org_id);
create index on messages (conversation_id);
create index on conversations (org_id, session_id);

-- Vector similarity search function
create or replace function match_chunks(
  query_embedding vector(1536),
  match_org_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    dc.id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.org_id = match_org_id
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- RLS Policies
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table learnings enable row level security;
alter table email_logs enable row level security;

-- Organizations: users can read their own org
create policy "Users can view their organization"
  on organizations for select
  using (
    id in (
      select org_id from profiles where id = auth.uid()
    )
  );

-- Profiles: users can read/update their own profile
create policy "Users can view own profile"
  on profiles for select
  using (id = auth.uid());

create policy "Users can update own profile"
  on profiles for update
  using (id = auth.uid());

-- Documents: org members can CRUD
create policy "Org members can view documents"
  on documents for select
  using (
    org_id in (
      select org_id from profiles where id = auth.uid()
    )
  );

create policy "Org members can insert documents"
  on documents for insert
  with check (
    org_id in (
      select org_id from profiles where id = auth.uid()
    )
  );

create policy "Org members can delete documents"
  on documents for delete
  using (
    org_id in (
      select org_id from profiles where id = auth.uid()
    )
  );

-- Document chunks: org members can view
create policy "Org members can view chunks"
  on document_chunks for select
  using (
    org_id in (
      select org_id from profiles where id = auth.uid()
    )
  );

-- Conversations: org members can view
create policy "Org members can view conversations"
  on conversations for select
  using (
    org_id in (
      select org_id from profiles where id = auth.uid()
    )
  );

-- Messages: org members can view
create policy "Org members can view messages"
  on messages for select
  using (
    conversation_id in (
      select id from conversations
      where org_id in (
        select org_id from profiles where id = auth.uid()
      )
    )
  );

-- Learnings: org members can view
create policy "Org members can view learnings"
  on learnings for select
  using (
    org_id in (
      select org_id from profiles where id = auth.uid()
    )
  );

-- Email logs: org members can view
create policy "Org members can view email logs"
  on email_logs for select
  using (
    org_id in (
      select org_id from profiles where id = auth.uid()
    )
  );

-- Auto-create profile on signup trigger
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
