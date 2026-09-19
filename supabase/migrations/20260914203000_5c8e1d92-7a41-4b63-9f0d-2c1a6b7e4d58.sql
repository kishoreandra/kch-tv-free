-- Reschedule the breadth snapshot, and make it refuse to record a non-session.
--
-- Background: `snapshot-breadth` used to run at 16:50 IST and stamp `breadth_daily`
-- with IST "today", derived from the live `stock_snapshot`. On a holiday that wrote a
-- row for a day NSE never traded — the same phantom-day bug as the price candles
-- (see 20260914183000_*, which deletes the rows already written). The endpoint now
-- verifies the session against NSE's own bhavcopy file before writing anything, which
-- means it has to run *after* that file is published. Hence the move to the evening.
--
--   19:30 / 20:00 / 20:30 / 21:00 IST (14:00,14:30,15:00,15:30 UTC) — four attempts so
--   a late bhavcopy still lands. The endpoint is idempotent (upsert on `day`) and
--   returns `skipped` when the file is not out yet, so extra runs cost nothing but a
--   HEAD-sized download.
--
-- Two parts, because both matter:
--   1. alter the running job (effective immediately, no "Reinstall cron" needed);
--   2. keep `install_snapshot_cron_jobs` in step, so a future Reinstall doesn't put
--      the 16:50 schedule back.

SELECT cron.alter_job(jobid, schedule := '0,30 14-15 * * 1-5')
  FROM cron.job
 WHERE jobname = 'snapshot-breadth';

DO $migration$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'install_snapshot_cron_jobs';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'public.install_snapshot_cron_jobs does not exist — cannot keep it in step';
  END IF;

  IF position('0,30 14-15 * * 1-5' IN v_def) > 0 THEN
    RAISE NOTICE 'install_snapshot_cron_jobs already schedules snapshot-breadth in the evening';
  ELSE
    -- Patched rather than re-pasted: the body is ~170 lines and a transcription slip
    -- there would silently alter or drop an unrelated job. This fails loudly instead.
    v_new := replace(
      v_def,
      '''snapshot-breadth'', ''20 11 * * 1-5''',
      '''snapshot-breadth'', ''0,30 14-15 * * 1-5'''
    );

    IF v_new = v_def THEN
      RAISE EXCEPTION 'could not find the snapshot-breadth schedule in install_snapshot_cron_jobs — nothing changed';
    END IF;

    EXECUTE v_new;
    RAISE NOTICE 'install_snapshot_cron_jobs updated: snapshot-breadth now runs at 19:30/20:00/20:30/21:00 IST';
  END IF;
END
$migration$;
