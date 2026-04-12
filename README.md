# Chodex Platform

**AI Document Assistant Platform** — Turn your documentation into a conversational AI assistant that answers questions, learns from conversations, and sends email summaries.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (Postgres + pgvector) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| AI Chat | Azure OpenAI (GPT-4) |
| Embeddings | Azure OpenAI (text-embedding-ada-002) |
| Email | Resend |
| Deployment | Vercel |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Next.js App                       │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  Dashboard   │  │  Public Chat │  │  API      │ │
│  │  /dashboard  │  │  /chatbot/   │  │  Routes   │ │
│  │  (auth)      │  │  [orgSlug]   │  │           │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────┘
         │                    │               │
         ▼                    ▼               ▼
┌──────────────┐  ┌───────────────┐  ┌──────────────┐
│  Supabase    │  │  Azure OpenAI │  │   Resend     │
│  - Postgres  │  │  - Chat       │  │  (Email)     │
│  - Auth      │  │  - Embeddings │  └──────────────┘
│  - Storage   │  └───────────────┘
│  - pgvector  │
└──────────────┘
```

## RAG Pipeline

1. **Document Upload** → File stored in Supabase Storage
2. **Text Extraction** → PDF/DOCX/TXT parsed on server
3. **Chunking** → Text split into ~500-token chunks with 50-token overlap
4. **Embedding** → Each chunk embedded via `text-embedding-ada-002`
5. **Storage** → Embeddings stored in `document_chunks` with pgvector

**At query time:**
1. User message → embed with same model
2. `match_chunks()` SQL function → cosine similarity search
3. Top-5 chunks → injected as context into system prompt
4. Azure GPT-4 → streamed response
5. Message + learnings saved to DB
6. Email summary sent if visitor email captured

## Setup

### Prerequisites

- Node.js 20+
- Supabase project with pgvector enabled
- Azure OpenAI deployment (chat + embeddings)
- Resend account

### 1. Clone and install

```bash
git clone https://github.com/yourorg/chodex-platform
cd chodex-platform
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-azure-key
AZURE_OPENAI_DEPLOYMENT=your-chat-deployment-name
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-ada-002
AZURE_OPENAI_API_VERSION=2024-10-21

RESEND_API_KEY=re_your_key
EMAIL_FROM=noreply@yourdomain.com

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run Supabase migration

```bash
# Using Supabase CLI
supabase db push

# Or paste supabase/migrations/001_initial.sql into the Supabase SQL editor
```

### 4. Create Supabase Storage bucket

In the Supabase Dashboard → Storage → New bucket:
- Name: `documents`
- Public: `false`
- File size limit: `50MB`

### 5. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

### Vercel (recommended)

```bash
npm i -g vercel
vercel --prod
```

Set all environment variables in the Vercel dashboard under **Project → Settings → Environment Variables**.

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

## Project Structure

```
chodex-platform/
├── app/
│   ├── (auth)/             # Login, signup pages
│   ├── (dashboard)/        # Protected dashboard pages
│   ├── api/                # API routes (chat, documents, email)
│   ├── chatbot/[orgSlug]/  # Public embeddable chatbot
│   └── page.tsx            # Landing page
├── components/
│   ├── ui/                 # Reusable UI primitives
│   ├── chat/               # Chat widget components
│   ├── documents/          # Document upload/list
│   └── dashboard/          # Sidebar, stats cards
├── lib/
│   ├── supabase/           # Client/server/middleware helpers
│   ├── openai/             # Chat + embedding utilities
│   ├── documents/          # Chunker + text extractor
│   └── email/              # Resend email helpers
├── types/                  # TypeScript interfaces
└── supabase/migrations/    # SQL schema
```

## Multi-Tenancy

Each **Organization** is a tenant. All data (documents, conversations, learnings) is isolated by `org_id` with Postgres Row Level Security (RLS). The public chatbot URL is scoped to `/chatbot/[orgSlug]`.

## License

MIT — see [LICENSE](LICENSE)
