# Self-hosting NSE MultiView (100% free)

Everything below runs on permanently free tiers: GitHub + Supabase Free +
Cloudflare Workers (or Vercel Hobby) + cron-job.org / GitHub Actions.

---

## 1. Code

```bash
git clone https://github.com/<you>/<repo>.git
cd <repo>
bun install
```

## 2. Database + Auth (Supabase Free)

1. Create a project at supabase.com (region: `ap-south-1` Mumbai).
2. Database → Extensions: enable `pg_cron` and `pg_net`.
3. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <new-ref>
   npx supabase db push          # runs everything in supabase/migrations/
   ```
4. Authentication → Providers: enable **Email**, and **Google** with your own
   Google Cloud OAuth client. Add these to the Google client:
   - Authorized origin: `https://<your-domain>`
   - Redirect URI: `https://<new-ref>.supabase.co/auth/v1/callback`
5. Copy the Project URL, anon key and service_role key.

## 3. App hosting

### Cloudflare Workers (uses the existing `wrangler.jsonc`)

```bash
bunx wrangler login
bun run build
bunx wrangler deploy
```

### Or Vercel Hobby — preferred if the heavy Bhavcopy ingestion jobs hit
Cloudflare's 10 ms CPU limit. Import the repo at vercel.com, build command
`bun run build`.

## 4. Environment variables (set on the host)

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_STANDALONE_AUTH=true          # switches Google login to native Supabase

SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

CRON_SECRET=<random 32+ chars>
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_CHAT_ID=<chat id>
LOVABLE_PROJECT_URL=https://<your-domain>
```

`VITE_STANDALONE_AUTH=true` is the only switch needed to drop the Lovable
auth broker — see `src/components/AuthButton.tsx`. Once set you may also
`bun remove @lovable.dev/cloud-auth-js` and delete
`src/integrations/lovable/`.

## 5. Scheduled jobs

All endpoints authenticate with the header `x-cron-secret: $CRON_SECRET`
(see `src/routes/api/public/cron/-_auth.ts`).

| Endpoint | Suggested schedule (UTC) |
| --- | --- |
| `/api/public/cron/refresh-price-bands` | `30 1,13 * * 1-5` (07:00 / 19:00 IST) |
| `/api/public/cron/ingest-daily` | `0 12 * * 1-5` |
| `/api/public/cron/ingest-bhavcopy` | `15 12 * * 1-5` |
| `/api/public/cron/snapshot-breadth` | `30 12 * * 1-5` |
| `/api/public/cron/ingest-index-close` | `35 12 * * 1-5` |
| `/api/public/cron/evaluate-alerts` | `*/15 3-10 * * 1-5` |
| `/api/public/cron/deliver-reminders` | `*/15 3-12 * * 1-5` |
| `/api/public/cron/cleanup-band-changes` | `30 13 * * 5` (Fri 19:00 IST) |

**cron-job.org** (free, unlimited): one job per row, method POST, custom
header `x-cron-secret`.

**Or GitHub Actions** — `.github/workflows/cron.yml`:

```yaml
name: NSE crons
on:
  schedule:
    - cron: '0 12 * * 1-5'
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - run: |
          for job in ingest-daily ingest-bhavcopy snapshot-breadth; do
            curl -fsS -X POST "https://${{ secrets.APP_DOMAIN }}/api/public/cron/$job" \
              -H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
          done
```

## 6. Move your existing data

Migrations create tables, RLS and functions — not rows. Export from the
current backend and import via Supabase Table Editor → Import CSV, in this
order: `profiles` → `user_watchlists` → `journal_entries` → `journal_trades`
→ `price_alerts` → `custom_reminders` → `price_bands` → `daily_prices`.

## 7. Verify

```bash
curl -i -X POST "https://<your-domain>/api/public/cron/refresh-price-bands" \
  -H "x-cron-secret: <CRON_SECRET>"
```

Then sign in on the site and confirm a watchlist saves.

### Free-tier notes
- Supabase Free: 500 MB DB; weekday crons keep it from auto-pausing.
- Cloudflare Free: 100k req/day; move heavy ingestion to Vercel or a GitHub
  Actions runner if you hit CPU limits.
