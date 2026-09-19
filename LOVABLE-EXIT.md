# Lovable exit — migration state

Living document. Update as phases complete. Started 19-Sep-2026.

## Status — start here

| Phase                                                   | State                  |
| ------------------------------------------------------- | ---------------------- |
| 1. De-Lovable the **build**                             | ✅ **DONE & verified** |
| 2. De-Lovable the **app** (auth broker, hardcoded URLs) | ✅ **DONE & verified** |
| 3-7. Supabase, data, deploy, schedules, verify          | ⬜ not started         |

Commits on `main` (this repo has no remote yet):

| SHA       | What                                                              |
| --------- | ----------------------------------------------------------------- |
| `c6166fe` | Baseline: import of `kch-tv@31aca3e`, `.env` untracked            |
| `7bde4ee` | `build:` Vite config rewritten standalone (byte-identical output) |
| `207d237` | `chore(deps):` drop bun + Lovable build package                   |
| `4b6b7b5` | `docs:` this file + `.github/copilot-instructions.md`             |

Run `git log --oneline` for the current tip. The last full build verification was green;
working tree clean.

**Next action:** Phase 3 (new Supabase project). Read the Phase 3 note first — the
migrations bake `https://kch-tv.lovable.app` into ~19 pg_cron jobs; rewrite the host
**before** `supabase db push`.

**Two former decision items are now resolved** (commit `a464feb`): the unused
`@cloudflare/vite-plugin` dependency was removed, and `wrangler.jsonc`'s stale
`"main"` was dropped — the build's "Wrangler config main is overridden" warning is
gone. See the Phase 1 notes below for details.

### How to resume in a new session

1. Open this folder (`d:\kch-tv-free`) as the workspace.
2. **Activate Node 22 first.** A fresh shell resolves to global Node 20.10.0 and the build
   fails on `@tanstack/react-start`'s engine requirement:
   ```powershell
   $env:Path = "C:\Users\ADMIN\AppData\Roaming\fnm\node-versions\v22.23.2\installation;$env:Path"
   ```
3. Nothing to reinstall — `node_modules` is already present.
4. Then just say: _"Read LOVABLE-EXIT.md and continue with the pending list."_

## PENDING — consolidated

Everything outstanding in one list. Phase detail is further down.

### Hygiene — do these first

- [x] **Create the GitHub remote and push — DONE (19-Sep-2026).** `origin` =
      `https://github.com/kishoreandra/kch-tv-free.git` (private). All commits pushed;
      `main` tracks `origin/main`. Auth was fixed by deleting the stale
      `git:https://github.com` Windows credential (it held the wrong account,
      `pranay-999`); the fresh Git-Credential-Manager browser sign-in then succeeded.
      Note: do **not** push to `upstream` — its push URL is deliberately
      `DISABLED-read-only`.
- [x] **Rewrite `MIGRATION.md`.** Done: npm everywhere (no bun), all 14 cron endpoints
      listed with the correct per-endpoint guard table, `APP_URL` documented, and the
      Phase 3 pg_cron host-rewrite warning added.

### Phase 2 — de-Lovable the app ✅ DONE & VERIFIED

All items complete (build green after the changes):

- [x] `AuthButton.tsx` — `VITE_STANDALONE_AUTH` branch and `lovable.auth.signInWithOAuth`
      removed; always `supabase.auth.signInWithOAuth`.
- [x] `integrations/supabase/previewAuthStorage.ts` — deleted; `client.ts` now passes
      plain `localStorage` (SSR-safe: `undefined` when no `window`). The "Connect Supabase
      in Lovable Cloud." error strings in `client.ts`, `client.server.ts` and
      `auth-middleware.ts` were also cleaned.
- [x] Deleted `integrations/lovable/` and the `@lovable.dev/cloud-auth-js` dependency
      (`npm install` removed it; `node_modules/@lovable.dev/` is gone).
- [x] Deleted `.lovable/` (`plan.md`, `project.json`).
- [x] The 4 hardcoded `kch-tv.lovable.app` URLs now build from `process.env.APP_URL`
      (with a clear error if unset): `admin/index-backfill.functions.ts`,
      `admin/refresh-price-bands.functions.ts`, `breadth/market-sa.functions.ts`,
      `telegram.server.ts` (`SITE`).
- [x] Env `LOVABLE_PROJECT_URL` → `APP_URL` (`breadth.functions.ts`), `.env.example`
      updated (also dropped `VITE_STANDALONE_AUTH`, fixed the `bun run build` mention).
- [x] `og:image` / `twitter:image` repointed to `/favicon.png` (`routes/__root.tsx`).
      A proper absolute og image should be added once the final domain is known.
- [x] The 3 User-Agent strings no longer advertise lovable.dev:
      `ohlc.functions.ts`, `history/yahoo-backfill.server.ts`, `screener/bundle.functions.ts`.
- [x] "Crafted on Lovable" badge removed (`routes/index.tsx`).
- [x] Stale comment referencing "Lovable's published-site auth gate" fixed
      (`routes/api/public/cron/refresh-snapshot.ts`).

Only remaining `lovable` match in `src/` is the NSE ticker `LOVABLE` in
`src/data/nse-symbols.ts` — a stock name, not a dependency.

### Decisions needed before Phase 3 / 5

- [x] Remove the unused `@cloudflare/vite-plugin` dependency — **DONE (`a464feb`)**.
      Verified: no source file imports it (only `package.json` / lockfile referenced it);
      `vite.config.ts` never used it; `npm install` removed it from node_modules; build
      output identical and green.
- [x] Reconcile `wrangler.jsonc` — **DONE (`a464feb`)**. Nitro reads the root config's
      `name`, `compatibility_date` and `compatibility_flags` but always overrides `main`
      with its own entry (`index.mjs` in `.output/server/wrangler.json`), which is why the
      build warned "Wrangler config main is overridden and will be ignored". Removed the
      stale `"main": "src/server.ts"` field; the warning is gone and the emitted config
      is unchanged. Deploy with `npx wrangler deploy` from `.output/server/` (or let the
      deploy step pick the generated config).
- [x] Cherry-pick orphaned branches — **DEFERRED / leaning decline (19-Sep-2026).**
      - `upstream/origin/main-working-codex` (`c9a8a46`, RS-rating default filter): **skip** —
        superseded; current `main` already carries a more evolved version (five
        `rs_rating*` filter variants in `filters.ts`, all `rs_rating*` columns in
        `snapshot.server.ts`). A cherry-pick would conflict with three months of drift.
      - `upstream/origin/fix/constituents-access` (`ce11076`, public constituents page):
        **deferred, user to decide** — `main` still gates `constituents.functions.ts`
        behind `requireApprovedAuth`, so it was never absorbed; but the commit's 76-line
        `snapshot.server.ts` change has diverged, so only the ~6-line core (swap
        user-auth for `supabaseAdmin`) could be re-applied by hand if wanted.
- [x] One scheduler only — **CHOSEN: pg_cron (19-Sep-2026).** The migrations already
      install the ~19 jobs, so no extra account or dashboard setup; cron-job.org will
      NOT be scheduled for these jobs (double-fire trap). It may still be used as a
      manual "run now" console for backfills, with no overlapping schedules.
- [x] Cloudflare Workers vs Vercel — **CHOSEN: Cloudflare Workers (19-Sep-2026)**.
      Zero build-config change (nitro already emits `cloudflare-module`, wrangler config
      ready). The ingestion endpoints are already chunked (`offset`/`limit` slices,
      `batchDays`/`budgetMs`, one bhavcopy session per call) to fit the 10 ms CPU limit.
      If live testing shows the limit is still blown, migrate to Vercel Hobby — a small
      config change, not a rewrite.

### Phase 3+ — one item must not be missed

- [ ] Rewrite the `https://kch-tv.lovable.app` host inside `install_snapshot_cron_jobs`,
      `install_breadth_cron_jobs` and `install_index_cron_jobs` **before** `supabase db push`,
      otherwise ~19 pg_cron jobs are recreated pointing at the old host.

## Goal

Remove **all** Lovable dependencies — build, runtime and data — from this project
and deploy it on permanently free infrastructure. Not "re-host while still Lovable".

## Repo layout

| Path             | Role                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| `d:\kch-tv`      | **OLD / production. Do not modify.** Origin `git@github.com:kishoreandra/kch-tv.git` |
| `d:\kch-tv-free` | **This repo.** Fresh history, baseline `c6166fe`                                     |

`upstream` in this repo points at `d:/kch-tv` (**local path, fetch-only** — the push URL
is `DISABLED-read-only`). Fetch refspecs pull in both its local branches and every
GitHub-tracking branch, so `upstream/origin/*` gives cherry-pick access to all 6 old
branches.

### Why upstream is a local path, not the GitHub URL

`git fetch git@github.com:kishoreandra/kch-tv.git` **fails on this machine**:
`Permission denied (publickey)`. The key `SHA256:nr4u3v+hbsU0UJ7HzLqjT/65O13ehG/uFQYzrsy19wI`
(`keechu1008@gmail.com`) is not authorized on the `kishoreandra` account and no ssh-agent
is running.

**Workflow to pull Lovable's new commits:** pull them in `d:\kch-tv` first using your
normal auth, then `git fetch upstream` here.

### Orphaned branches — not merged, left alone

- `upstream/origin/fix/constituents-access` — +1 (`ce11076`, 2026-06-14)
- `upstream/origin/main-working-codex` — +1 (`c9a8a46`, 2026-06-28)

`feat-antigravity` and `main-working` are fully merged into main.

## Environment (verified)

| Tool | Version              | Note                                                                      |
| ---- | -------------------- | ------------------------------------------------------------------------- |
| Node | **v22.23.2** via fnm | Global Node is v20.10.0 at `C:\Program Files\nodejs` — **left untouched** |
| npm  | 10.9.8               | **`bun` is NOT installed on this machine**                                |
| git  | 2.35.1               |                                                                           |

Node was activated with:

```powershell
$env:Path = "C:\Users\ADMIN\AppData\Roaming\fnm\node-versions\v22.23.2\installation;$env:Path"
```

`fnm exec --using=22 -- npm ...` does **not** work (cannot spawn `npm.cmd` on Windows);
prepend to PATH instead. This repo carries `.node-version` = `22.23.2`.

### Node 22.12+ is mandatory

```
vite@7.3.1              engines: ^20.19.0 || >=22.12.0
@tanstack/react-start   engines: >=22.12.0
```

Global Node 20.10.0 **cannot build this project at all**. Do not upgrade global Node to
22 — other projects on this machine depend on Node 20.

## Baseline commit

`c6166fe` — "Baseline: import kch-tv@31aca3e, .env untracked", 259 files.

Differs from `upstream/origin/main` in **exactly 3 paths**, zero source changes:

- `.env` — dropped (was tracked upstream; now ignored)
- `.env.example` — added
- `.gitignore` — +7 lines

Baseline was deliberately established **before** any migration edits, so every
migration commit is a reviewable delta against it.

## Phase 0 — decisions

| Decision        | Choice                                                  |
| --------------- | ------------------------------------------------------- |
| Working copy    | `d:\kch-tv-free`                                        |
| History         | Fresh, single baseline commit                           |
| Old repo        | Kept as fetch-only `upstream`                           |
| New GitHub repo | **Create only after the build passes locally**          |
| Node strategy   | fnm + repo-local `.node-version`; global Node untouched |

### Still open

1. ~~One scheduler only~~ — **CHOSEN: pg_cron** (19-Sep-2026; see PENDING section).
2. ~~Cloudflare Workers vs Vercel~~ — **CHOSEN: Cloudflare Workers** (19-Sep-2026;
   see PENDING section).
3. ~~Cherry-pick either orphaned branch~~ — deferred/declined (see PENDING section);
   only `ce11076`'s core idea (public constituents page) remains a possible manual
   re-apply if wanted later.

## Phase 1 — de-Lovable the build ✅ DONE & VERIFIED

Done:

- Deleted `bun.lock` (120 `pkg.dev` private-registry lines, 0 npmjs — unusable off-platform)
- Deleted `package-lock.json` (stale: declared `^1.7.0` while `package.json` pins `2.13.1`)
- Deleted `bunfig.toml` (bun-only config; bun is not installed)
- Added `.node-version` = `22.23.2`
- `npm install` → 507 packages from **public** npm (lockfile regenerated clean)
- Rewrote `vite.config.ts` with explicit plugins
- Removed `@lovable.dev/vite-tanstack-config`; added `lightningcss` to devDependencies

### Verification

Three builds, compared by extracting every `.output/` line (name + size + gzip size):

| Build                | Config                                  | Result                   |
| -------------------- | --------------------------------------- | ------------------------ |
| `build-baseline.log` | original Lovable config                 | 321 output lines, exit 0 |
| `build-step1.log`    | new config, Lovable pkg still installed | **zero differences**     |
| `build-step2.log`    | new config, Lovable pkg removed         | **zero differences**     |

`Compare-Object` returned empty for both comparisons — the emitted artifacts are
identical (Vite/Rollup filenames are content-hashed, so equal names ⇒ equal content).

`npm install` after removal: _"added 6 packages, removed 12 packages"_.
`node_modules/@lovable.dev/` now contains **only `cloud-auth-js`** — the Phase 2 target.

### What the replacement `vite.config.ts` reproduces

Read from `node_modules/@lovable.dev/vite-tanstack-config/dist/index.js`. Ignoring the
sandbox-only paths, the non-sandbox plugin order is:

1. `tailwindcss()` — `@tailwindcss/vite`
2. `tsConfigPaths({ projects: ["./tsconfig.json"] })`
3. `tanstackStart({ importProtection: {...}, server: { entry: "server" } })`
4. `nitro({ defaultPreset: "cloudflare-module" })` — **build only**, lazily imported
5. `viteReact()`

Plus config: `css.transformer: "lightningcss"`, `resolve.alias["@"]`,
`resolve.dedupe` (react, react-dom, react/jsx-runtime, react/jsx-dev-runtime,
@tanstack/react-query, @tanstack/query-core), `optimizeDeps.include` + `ignoreOutdatedRequests`,
`server: { host: "::", port: 8080 }`, and a `server.watch.awaitWriteFinish` debounce
(stabilityThreshold 1000 / pollInterval 100).

**Deliberately dropped** (all no-ops or Lovable-sandbox-only): sandbox detection
(`LOVABLE_SANDBOX` / `DEV_SERVER__PROJECT_PATH`), port-8080 forcing + `strictPort`,
HMR gate, dev-server bridge, `/__l5e/assets-v1` asset proxy, Lovable build-error
diagnostics, dev-mode TanStack devtools overlay, and `componentTagger`.

`lightningcss` had to be declared explicitly — it previously arrived only as a
dependency of the Lovable package (`css.transformer: "lightningcss"` requires it).

### Dependency drift — worth knowing

`package.json` uses caret ranges, so this fresh install resolved **newer** versions than
Lovable built against (its private-registry lockfile pinned exact versions):

| Package                   | Declared    | Installed |
| ------------------------- | ----------- | --------- |
| `@tanstack/router-plugin` | `^1.167.28` | 1.168.40  |
| `@tanstack/react-router`  | `^1.168.25` | 1.170.38  |
| `@tanstack/react-start`   | `^1.167.50` | 1.168.56  |
| `vite`                    | `^7.3.1`    | 7.3.6     |

Consequence: `src/routeTree.gen.ts` is regenerated on every build. The baseline
regeneration was verified as **pure import reordering** — sorted line sets identical
(634 lines, 108 route ids in both), zero semantic change. It is a generator-version
artifact, **not** a config artifact: it happened on the baseline build before
`vite.config.ts` was touched.

Expect `routeTree.gen.ts` to show as modified after any build; it is generated output.
Only worry if the change is _semantic_, not ordering.

### Known leftover — resolved (`a464feb`)

`@cloudflare/vite-plugin` was a direct dependency the build never used — `nitro`
emits `.output/server/wrangler.json` itself. It has been removed from `package.json`
(verified: no source imports, build output identical).

The build's `[cloudflare] Wrangler config main is overridden and will be ignored`
warning is also gone: the stale `"main": "src/server.ts"` in `wrangler.jsonc` was
removed. Nitro reads the root config's `name` / `compatibility_date` /
`compatibility_flags` and overrides `main` with its own `index.mjs`.

## Phase 2 — de-Lovable the app ✅ DONE (see the PENDING section above for details)

## Phase 3 — new Supabase project (NOT STARTED)

**Critical:** the migrations bake `https://kch-tv.lovable.app` into ~19 `cron.schedule` /
`net.http_post` calls inside `install_snapshot_cron_jobs`, `install_breadth_cron_jobs` and
`install_index_cron_jobs`, plus a hardcoded anon-key literal. `npx supabase db push` will
faithfully recreate all of them pointing at the old host. Rewrite the host **before** pushing.

Also: `.env` was tracked in the old repo — never repeat that. Real values go in the host's
secret store; `.env.example` is what gets committed.

## Phase 4 — data (NOT STARTED)

Import order: `profiles` → `user_watchlists` → `journal_entries` → `journal_trades` →
`price_alerts` → `custom_reminders` → `price_bands` → `daily_prices`.
Supabase Free is 500 MB — `daily_prices` and `index_prices` are the bulk, check they fit.
After import, re-run the 14-Sep phantom-candle cleanup (row-identity based).

## Phase 5-7 — deploy, schedules, verify

See `MIGRATION.md` (rewritten 19-Sep-2026: npm commands, all 14 cron endpoints,
correct per-endpoint guard table, one-scheduler warning).

### Cron endpoints: guard reference

| Guard                           | Endpoints                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `x-cron-secret` only            | `refresh-snapshot`, `refresh-vol-maxes`, `snapshot-breadth`, `evaluate-alerts`, `deliver-reminders`                                                             |
| `apikey` (publishable key) only | `refresh-price-bands`                                                                                                                                           |
| either header                   | `ingest-daily`, `ingest-bhavcopy`, `ingest-index-close`, `ingest-deals`, `cleanup-band-changes`, `backfill-prices`, `backfill-bhavcopy`, `backfill-index-close` |

An external scheduler calling `refresh-price-bands` with `x-cron-secret` gets a **401**.
