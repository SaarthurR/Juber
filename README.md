# JCNC Carpool

> Ahimsa on the road — share a ride, lower your footprint.

A Moober-style carpool board for the **Jain Center of Northern California (JCNC)** community.
Members sign in with Google, post and find carpools (and ride requests) to the temple,
coordinate via in-app messaging + contact info, and rally around events like **Paryushan**.

Built with **Next.js (App Router)** + **Supabase** (Postgres, Auth, Realtime, RLS),
deployed on **Vercel**.

## Features

- 🔐 Google sign-in (Supabase Auth)
- 🚗 Post a ride (time, from/to, seats, optional gas contribution)
- 🙋 Request a ride
- 🔎 Browse + filter by from / to / date
- 💺 Seat requests with driver confirm/decline (seats auto-sync)
- 💬 Realtime in-app messaging + open contact (phone/WhatsApp)
- 📅 First-class events with their own ride boards
- 🛠️ Admin tools for events and preset locations

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. In **SQL Editor**, run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.
3. Enable **Google** auth: Authentication → Providers → Google. Add your Google OAuth
   client ID/secret (from Google Cloud Console). Set the authorized redirect URL to:
   `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
4. Under Authentication → URL Configuration, add your site URLs
   (`http://localhost:3000` and your Vercel domain) to **Redirect URLs**.

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in from Supabase
(Project Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 3. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Make yourself an admin

After signing in once, run this in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

Then the **Admin** link appears in the navbar (create events / preset locations).

## Deploy to Vercel

1. Push to GitHub and import the repo at [vercel.com](https://vercel.com).
2. Add the same env vars in Vercel → Project → Settings → Environment Variables
   (set `NEXT_PUBLIC_SITE_URL` to your production domain).
3. Add your Vercel domain to Supabase Auth redirect URLs.
4. Deploy.

## Project structure

```
src/
  app/
    page.tsx              Home (hero, events, latest rides)
    rides/                Board, post ride, ride detail, actions
    requests/new/         Post a ride request
    events/               Event list + event page
    profile/              Own edit + public profile
    messages/             Inbox + realtime thread + actions
    admin/                Admin tools + actions
    auth/                 OAuth callback + signout
  components/             RideCard, RouteTrack, MessageThread, Navbar, …
  lib/
    supabase/             Browser/server/proxy clients
    auth.ts types.ts utils.ts constants.ts
  proxy.ts                Session refresh (Next 16 proxy convention)
supabase/
  migrations/0001_init.sql
  seed.sql
```
