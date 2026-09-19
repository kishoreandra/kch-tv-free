REVOKE EXECUTE ON FUNCTION public.install_snapshot_cron_jobs(text) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.install_snapshot_cron_jobs(text) TO service_role;