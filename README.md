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
| `/menu` | Manage drinks and modifiers (no auth) |
| `/admin` | Admin panel — session reset, approve requests, history |

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
3. Run `supabase/seed.sql` to populate drinks, modifiers, a default session, and the admin password
4. Copy your **Project URL** and **anon public key** from **Project Settings → API** into `.env.local`

## Vercel deployment

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com/new)
3. Add environment variables in **Project Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-detects Next.js, no `vercel.json` needed

## Default admin password

The seed sets the admin password to **`admin123`**.

Change it immediately after first login: go to `/admin` → **Settings** tab → Change Admin Password.

## How the app works

- **Session**: all orders belong to an active session. The admin can reset the session (clears orders); all connected clients see the update instantly via Supabase Realtime.
- **Ordering**: pick a drink, toggle modifier pills (multi-select — mix and match freely), then submit. Only you can delete your own order (matched by name).
- **Reset requests**: anyone can send a "Request Reset" from the ordering page. The admin sees pending requests in real time and can approve or reject them.
- **Menu editing**: `/menu` lets anyone add/edit/delete drinks and modifiers. Changes appear on the ordering page immediately.
