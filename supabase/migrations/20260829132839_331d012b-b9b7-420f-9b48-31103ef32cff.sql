ALTER TABLE public.price_alerts ADD COLUMN IF NOT EXISTS times_triggered integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bump_alert_triggers(_ids uuid[], _at timestamptz, _disable boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.price_alerts
  SET last_state = true,
      last_triggered_at = _at,
      times_triggered = times_triggered + 1,
      enabled = CASE WHEN _disable THEN false ELSE enabled END
  WHERE id = ANY(_ids);
$$;

REVOKE ALL ON FUNCTION public.bump_alert_triggers(uuid[], timestamptz, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_alert_triggers(uuid[], timestamptz, boolean) TO service_role;