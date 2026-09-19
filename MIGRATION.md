# Self-hosting NSE MultiView (100% free)

Everything below runs on permanently free tiers: GitHub + Supabase Free +
Cloudflare Workers (or Vercel Hobby) + one external scheduler.

> **Node requirement:** this project needs **Node 22.12+** (see `.node-version`).
> All commands below use `npm` — **bun is not used anywhere in this repo.**

---

## 1. Code

```bash
git clone https://github.com/<you>/<repo>.git
cd <repo>
npm install
```

## 2. Database + Auth (Supabase Free)

1. Create a project at supabase.com (region: `ap-south-1` Mumbai).
2. Database → Extensions: enable `pg_cron` and `pg_net`.
3. **Before pushing migrations:** the migration files bake
   `https://kch-tv.lovable.app` into ~19 `cron.schedule` / `net.http_post`
   calls (inside `install_snapshot_cron_jobs`, `install_breadth_cron_jobs`
   and `install_index_cron_jobs`) plus a hardcoded anon-key literal.
   Rewrite that host to your own domain **before** running `db push`,
   otherwise every pg_cron job is recreated pointing at the old host.
4. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <new-ref>
   npx supabase db push          # runs everything in supabase/migrations/
   ```
5. Authentication → Providers: enable **Email**, and **Google** with your own
   Google Cloud OAuth client. Add these to the Google client:
   - Authorized origin: `https://<your-domain>`
   - Redirect URI: `https://<new-ref>.supabase.co/auth/v1/callback`
6. Copy the Project URL, anon key and service_role key.

## 3. App hosting

### Cloudflare Workers (uses the existing `wrangler.jsonc`)

```bash
npx wrangler login
npm run build
npx wrangler deploy
```

Note: the build emits its own `.output/server/wrangler.json`; the `main`
entry in the repo's `wrangler.jsonc` is overridden by the build (this is a
known item to reconcile — see `LOVABLE-EXIT.md`).

### Or Vercel Hobby — preferred if the heavy Bhavcopy ingestion jobs hit
Cloudflare's 10 ms CPU limit. Import the repo at vercel.com, build command
`npm run build`.

## 4. Environment variables (set on the host)

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>

SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

APP_URL=https://<your-domain>
CRON_SECRET=<random 32+ chars>
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_CHAT_ID=<chat id>
```

`APP_URL` is the public base URL of the deployment: server functions use it
to call their own cron routes server-to-server, and Telegram messages use it
to build chart links. `VITE_*` variables are inlined by Vite **at build
time** — they must be present during `npm run build`, not just at runtime.

## 5. Scheduled jobs

There are **14** cron endpoints under `/api/public/cron/`. They do **not**
all use the same guard — check the table before wiring a scheduler:

| Guard | Endpoints |
| --- | --- |
| `x-cron-secret: $CRON_SECRET` only | `refresh-snapshot`, `refresh-vol-maxes`, `snapshot-breadth`, `evaluate-alerts`, `deliver-reminders` |
| `apikey: <anon key>` only | `refresh-price-bands` |
| either header | `ingest-daily`, `ingest-bhavcopy`, `ingest-index-close`, `ingest-deals`, `cleanup-band-changes`, `backfill-prices`, `backfill-bhavcopy`, `backfill-index-close` |

Calling `refresh-price-bands` with `x-cron-secret` returns **401** — it only
accepts the Supabase publishable key.

Suggested schedules (UTC); the authoritative schedules live in the
`cron.schedule` calls inside `supabase/migrations/`:

| Endpoint | Suggested schedule (UTC) |
| --- | --- |
| `/api/public/cron/refresh-price-bands` | `30 1,13 * * 1-5` (07:00 / 19:00 IST) |
| `/api/public/cron/ingest-daily` | `0 12 * * 1-5` |
| `/api/public/cron/ingest-bhavcopy` | `15 12 * * 1-5` |
| `/api/public/cron/snapshot-breadth` | `30 12 * * 1-5` |
| `/api/public/cron/ingest-index-close` | `35 12 * * 1-5` |
| `/api/public/cron/ingest-deals` | `45 12 * * 1-5` |
| `/api/public/cron/refresh-snapshot` | `0 13 * * 1-5` |
| `/api/public/cron/refresh-vol-maxes` | `15 13 * * 1-5` |
| `/api/public/cron/evaluate-alerts` | `*/15 3-10 * * 1-5` |
| `/api/public/cron/deliver-reminders` | `*/15 3-12 * * 1-5` |
| `/api/public/cron/cleanup-band-changes` | `30 13 * * 5` (Fri 19:00 IST) |
| `/api/public/cron/backfill-prices` | manual / on demand |
| `/api/public/cron/backfill-bhavcopy` | manual / on demand |
| `/api/public/cron/backfill-index-close` | manual / on demand |

**Pick ONE scheduler.** Running `pg_cron` (installed by the migrations) and
an external scheduler (cron-job.org / GitHub Actions) together double-fires
every job. The migrations install the pg_cron jobs automatically — use an
external scheduler only if you disable the pg_cron schedules.

**cron-job.org** (free, unlimited): one job per row, method POST, custom
header per the guard table above.

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

Supabase Free is 500 MB — `daily_prices` and `index_prices` are the bulk;
check they fit before importing. After import, re-run the 14-Sep
phantom-candle cleanup (row-identity based).

## 7. Verify

```bash
curl -i -X POST "https://<your-domain>/api/public/cron/snapshot-breadth" \
  -H "x-cron-secret: <CRON_SECRET>"
```

Then sign in on the site and confirm a watchlist saves.

### Free-tier notes
- Supabase Free: 500 MB DB; weekday crons keep it from auto-pausing.
- Cloudflare Free: 100k req/day; move heavy ingestion to Vercel or a GitHub
  Actions runner if you hit CPU limits.