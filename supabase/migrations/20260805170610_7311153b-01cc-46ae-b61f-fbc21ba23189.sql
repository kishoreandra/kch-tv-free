DO $block$
DECLARE
  v_job record;
  v_suffix text;
  v_close_name text;
  v_min int;
BEGIN
  FOR v_job IN
    SELECT jobname, command
    FROM cron.job
    WHERE jobname ~ '^refresh-price-bands-groww-[0-9]+$'
  LOOP
    v_suffix := substring(v_job.jobname from '([0-9]+)$');
    v_close_name := format('refresh-price-bands-groww-close-%s', v_suffix);
    v_min := 30 + (v_suffix::int * 3);

    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = v_close_name;

    PERFORM cron.schedule(
      v_close_name,
      format('%s 12 * * 1-5', v_min),
      v_job.command
    );
  END LOOP;
END
$block$;