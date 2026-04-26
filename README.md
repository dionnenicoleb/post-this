# Post This

One thought. Out into the world.

A single-screen ritual app. Static site. PWA. Saves each post to Supabase, then opens LinkedIn's composer with the text prefilled.

## Files

- `index.html` — the screen
- `style.css` — design system
- `app.js` — interactions, Supabase insert, LinkedIn share
- `manifest.json` — PWA manifest
- `sw.js` — service worker (offline shell)
- `icon.svg` — app icon (replace with PNG 192/512 before launch)

## Setup

### 1. Supabase

Run in the SQL editor:

```sql
create table posts (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  voice_url text,
  posted_at timestamptz not null default now()
);

alter table posts enable row level security;

create policy "anon can insert" on posts
  for insert to anon
  with check (true);
```

This lets the public anon key insert rows, but **not** read them. Reads stay locked. You can read your posts later from the Supabase dashboard.

### 2. Paste anon key into `app.js`

In Supabase: **Project Settings → API Keys → `anon` `public`** key. Paste it into `app.js`:

```js
const SUPABASE_ANON_KEY = "eyJ...";
```

The anon key is designed to be public. Safe to commit.

### 3. Run locally

Any static server works:

```bash
python3 -m http.server 3000
```

Open http://localhost:3000.

### 4. Deploy

Upload all files to GitHub. Vercel auto-detects static sites — no build config needed.

## PWA notes

- Service worker only runs over HTTPS (Vercel gives you that).
- Replace `icon.svg` with real `icon-192.png` and `icon-512.png` for iOS home-screen install.
