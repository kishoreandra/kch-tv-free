REVOKE EXECUTE ON FUNCTION public.install_snapshot_cron_jobs(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.install_snapshot_cron_jobs(text) TO service_role;