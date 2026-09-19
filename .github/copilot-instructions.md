# Repo instructions — kch-tv-free

This repo is the **Lovable-free rewrite** of `kch-tv`. Read `LOVABLE-EXIT.md` at the repo
root for full migration state, decisions and phase tracking. Update it as work proceeds.

## Ground rules

- **`d:\kch-tv` is live production. Never modify it.** It is registered here as the
  `upstream` remote with its **push URL disabled** (`DISABLED-read-only`). Do not re-enable it.
- **Never commit or push without explicit approval for each change.** Make edits, summarise,
  wait.
- The new GitHub repo does not exist yet — it is created only after the build passes locally.

## Toolchain — this machine

- **`bun` is NOT installed.** All `bun`/`bunx` commands in `MIGRATION.md` are wrong here;
  use `npm`/`npx`.
- **Node 22.12+ is mandatory** (`vite@7.3.1` needs `^20.19.0 || >=22.12.0`;
  `@tanstack/react-start` needs `>=22.12.0`). Global Node is v20.10.0 and **must stay that
  way** — other projects depend on it. Node 22.23.2 is installed under fnm; activate it with:

  ```powershell
  $env:Path = "C:\Users\ADMIN\AppData\Roaming\fnm\node-versions\v22.23.2\installation;$env:Path"
  ```

  `fnm exec --using=22 -- npm ...` fails on Windows (cannot spawn `npm.cmd`) — prepend to
  PATH instead.
- No ssh-agent is running and the local SSH key is not authorized on the `kishoreandra`
  GitHub account, so `git fetch git@github.com:...` fails. `upstream` uses the local path.

## Verifying changes

- Editor diagnostics **silently under-report** in this repo. `vite build` does no
  type-checking, so an unresolved import passes the build and only throws in the browser
  (`ReferenceError: X is not defined` means "missing import", not "build failure").
- Verify by reading source: check that every identifier used in JSX is imported, and grep
  actual usages — do not trust `get_errors` alone.
- supabase-js returns HTTP failures as `{ error }` and does **not** throw, so
  `try { await … } catch {}` never fires. Always check `const { error } = await …`.
- Keep generated Data API filters under ~10 KB; chunk `in (...)` lists at ~150 items.

## NSE data hazards

- `nsearchives.nseindia.com/.../sec_bhavdata_full_DDMMYYYY.csv` answers a date it has **no
  file for** with **HTTP 200 and the previous session's CSV** — not a 404. Never stamp a
  download with the date you requested; verify against the file's own `DATE1` column via
  `assertBhavcopyForDate`. **The exchange file decides; the calendar must not be load-bearing.**
