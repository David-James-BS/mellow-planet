# Kopitiam Order

A mobile-first group drink ordering app for kopitiam runs. Everyone opens the link on their phone, picks their drink using a click-based builder (Kopi, Teh, modifiers like C/Siu Dai/Peng), and the live order list updates in real time for everyone in the group. Supports PWA installation ("Add to Home Screen") so it feels like a native app.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Supabase** (PostgreSQL + Realtime)
- **Tailwind CSS**
- **Sonner** (toast notifications)
- **Vercel** (deployment)

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Place and view live orders |
| `/menu` | Redirects to the ordering page |
| `/admin` | Rounds panel — start/reset the shared session and view history |

## Local setup

```bash
# 1. Clone and install
git clone <your-repo-url>
cd mellow-planet
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run each file in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_add_strength_modifier.sql`
   - `supabase/migrations/003_allow_order_session_insert.sql`
   - `supabase/migrations/004_order_structure_and_round_integrity.sql`
   - `supabase/migrations/005_cleanup_duplicate_modifiers.sql`
   - `supabase/migrations/006_restore_standard_modifiers.sql`
   - `supabase/migrations/007_session_tables_and_resume.sql`
3. Run `supabase/seed.sql` to populate drinks, modifiers, and a default session
4. Copy your **Project URL** and **anon public key** from **Project Settings → API** into `.env.local`

If the database already exists, run `003_allow_order_session_insert.sql` and
`004_order_structure_and_round_integrity.sql`, then
`005_cleanup_duplicate_modifiers.sql` and
`006_restore_standard_modifiers.sql` in the Supabase SQL Editor. Migration 006
restores any standard choices removed by the earlier cleanup. Then rerun
`seed.sql` only if you want to refresh the curated drink/menu defaults.

To add tables and resume past rounds to an existing database, also run
`007_session_tables_and_resume.sql`. Existing orders remain unassigned until a
person joins a table or a current table member moves them.

## Vercel deployment

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com/new)
3. Add environment variables in **Project Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-detects Next.js, no `vercel.json` needed

## How the app works

- **Name**: first-time visitors enter a name once. The app remembers it and a private device ID on that phone for future kopi runs.
- **Session**: all orders belong to an active session. Anyone with the link can start/reset the round from `/admin`; all connected clients see the update instantly via Supabase Realtime.
- **Ordering**: pick a drink, choose one option per modifier group, then submit. You can edit or delete orders created by the same phone.
- **Tables**: anyone can start a table using their saved name, join one, or leave one. Current members can rename a table and add people with existing orders, moving all or selected orders. Deleting a table leaves its orders unassigned.
- **History**: `/admin` shows past rounds with order/table counts. Resuming a past round closes the active round first, then reopens the selected round with its existing orders and tables.
- **Menu data**: drinks and modifiers are maintained through the Supabase seed and migrations rather than through a public editing screen.
