# JCNC Carpool

> Ahimsa on the road — share a ride, lower your footprint.

A Moober-style carpool board for the **Jain Center of Northern California (JCNC)** community.
Members sign in with Google, post and find carpools (and ride requests) to the temple,
coordinate via in-app messaging plus booking-scoped contact info, and rally around events
like **Paryushan**.

Built with **Next.js (App Router)** + **Supabase** (Postgres, Auth, Realtime, RLS),
deployed on **Vercel**.

## Features

- Google sign-in (Supabase Auth)
- Post a ride or request a ride (time, from/to, seats, optional gas contribution)
- Browse and filter by from / to / date / trip type
- Seat requests with driver confirm/decline (seats auto-sync)
- Realtime in-app messaging plus booking-scoped phone/WhatsApp contact
- First-class public events with their own ride boards
- Admin tools: approve event requests, create events/places, JCNC calendar import
- Resettable admin demo mode with baked rides, requests, messages, maps, and moderation cases

## Setup

### 1. Create and link a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and link the repo:

   ```bash
   supabase link --project-ref YOUR-PROJECT-REF
   ```

3. Apply every migration (`0001` through `0032`, then all timestamped migrations):

   ```bash
   supabase db push
   supabase migration list --linked
   ```

   Local and remote histories should match through the latest migration, including
   `20260714050000_demo_sessions.sql`. Optionally run
   `supabase/seed.sql` in the SQL editor for default JCNC places.

4. Enable **Google** auth: Authentication → Providers → Google. Add your Google OAuth
   client ID/secret from Google Cloud Console. Set the authorized redirect URL to:

   ```
   https://YOUR-PROJECT.supabase.co/auth/v1/callback
   ```

5. Under Authentication → URL Configuration, add **Redirect URLs** for every environment:

   - `http://localhost:3000/auth/callback`
   - `https://YOUR-VERCEL-DOMAIN/auth/callback`

   The app builds OAuth redirects from `NEXT_PUBLIC_SITE_URL` and preserves the
   attempted path (including `/m/...` mobile routes) via the `next` query param.

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in values from Supabase
(Project Settings → API). **Never commit real keys.**

| Variable | Required | Where used |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser, server, middleware |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser, server, middleware |
| `NEXT_PUBLIC_SITE_URL` | Yes | OAuth redirect origin |
| `DEMO_SESSION_SECRET` | Hosted demo | Signs the isolated demo-session cookie |
| `DEMO_ADMIN_PASSCODE` | Local demo | Unlocks the offline presenter workspace |
| `DEMO_SQLITE_PATH` | Local demo | Stores offline demo state; never set this on Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Best-effort cancellation SMS |
| `TWILIO_ACCOUNT_SID` | Optional | Cancellation SMS |
| `TWILIO_AUTH_TOKEN` | Optional | Cancellation SMS |
| `TWILIO_FROM_NUMBER` | Optional | Cancellation SMS |

`SUPABASE_SECRET_KEY` is accepted as an alias for the service role key. Twilio vars are
best-effort: cancellation still succeeds if SMS delivery fails.

### 3. Run locally

```bash
npm install
npm run dev
```

- Desktop: [http://localhost:3000](http://localhost:3000)
- Mobile shell: [http://localhost:3000/m](http://localhost:3000/m)

### 4. Grant admin access

After signing in once, run in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

The **Admin** link appears in the navbar. Admins can approve event requests, create
events/places, and run **JCNC import** to seed likely high-traffic calendar items.

## Built-in demo mode

The admin page includes a **Demo mode** switch. It loads a fixed, isolated data set with
seven switchable personas and examples for every notification, ride/request state,
message thread, event review, report decision, warning, ban, and appeal flow. Google Maps
is replaced by deterministic address suggestions and route estimates, while Twilio,
calendar import, and other paid/network integrations are simulated.

- **Hosted/Vercel:** apply `20260714050000_demo_sessions.sql`, set a random
  `DEMO_SESSION_SECRET` of at least 32 characters, and leave `DEMO_SQLITE_PATH` unset.
  A signed-in admin can then turn demo mode on from `/admin`.
- **Offline rehearsal:** set `DEMO_ADMIN_PASSCODE` (at least 32 characters) and
  `DEMO_SQLITE_PATH=.juber/demo.sqlite`, then open `/admin/demo`. No Supabase or paid API
  key is required.
- **Replay:** **Reset** restores the original fixture immediately. **Exit** deletes the
  isolated session; opening demo mode again always starts from the original fixture.

## Live integration walkthrough

Use **two Google accounts** for the full driver/rider flow, or one account to explore
posting and admin tools.

### Contact-filled profiles (required before posting)

Phone and WhatsApp live in `profile_contacts` (migration `0020`). Both driver and rider
accounts need at least one contact method before posting rides or requests:

1. Sign in → **Profile** → add phone and/or WhatsApp → save.
2. Repeat for the second account.

### Driver + rider happy path

**Desktop**

1. Driver: `/rides/new` → post a ride to JCNC.
2. Rider: `/rides` → reserve a seat.
3. Driver: ride detail → confirm the passenger.
4. Rider: ride detail → **Contact** or **Messages** to coordinate pickup.
5. After departure + 24 hours, raw phone/WhatsApp expire; in-app chat remains for
   lost-item follow-up.

**Mobile**

Same flow under `/m`, `/m/rides/new`, `/m/rides/[id]`, and `/m/messages`. OAuth `next`
preserves the mobile shell when signing in from a gated action.

### Events

- Browse public events at `/events` (desktop) or `/m/events` (mobile).
- Signed-in members can suggest events; admins approve them or import from JCNC.

### Contact and chat policy

- Raw phone/WhatsApp are visible only to confirmed booking counterparties.
- Access ends **24 hours after scheduled departure** for active rides/fulfilled requests.
- Access ends **immediately** when a ride is closed or cancelled.
- **In-app chat is retained** in Past/Archived for lost-item follow-up regardless of
  raw-contact expiry.

### SMS fallback

Configure all three Twilio variables on Vercel to send cancellation texts. Without them,
in-app notifications still fire and cancellations succeed silently.

## Deploy to Vercel

1. Push to GitHub and import the repo at [vercel.com](https://vercel.com).
2. Add env vars from `.env.local.example` (set `NEXT_PUBLIC_SITE_URL` to production).
3. Add the Vercel domain to Supabase Auth redirect URLs.
4. Ensure migrations are pushed to the linked Supabase project before deploy.
5. Deploy. CI (`.github/workflows/ci.yml`) runs `npm ci`, test, lint, `tsc`, and build
   on every push/PR.

## Known limitations

- **Browser/Realtime E2E:** Full two-account browser and WebSocket acceptance was not run
  against a paid Supabase preview branch. Coverage relies on unit/static tests, isolated
  SQL fixtures, lint, typecheck, build, and read-only production checks.
- **Cancellation SMS:** Requires Twilio env vars plus `SUPABASE_SERVICE_ROLE_KEY` on the
  deployment; otherwise SMS is skipped.

## Project structure

```
src/
  app/
    (desktop)/          Desktop shell: home, rides, events, profile, messages, admin
    m/                  Mobile shell: /m, /m/rides, /m/events, /m/messages, /m/profile
    auth/               OAuth callback + signout
  components/           RideCard, MessageThread, ContactModal, admin forms, …
  lib/                  Supabase clients, auth, messages, notifications, …
supabase/
  migrations/           0001_init.sql … 0032_task13_admin_review_contracts.sql
  seed.sql              Default JCNC places
```

## Verification

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
supabase migration list --linked
```
