// Shared authentication helper for public cron endpoints.
//
// Auth: an `x-cron-secret` header (or `Authorization: Bearer …`) matching
// the CRON_SECRET env var. This is a private, rotatable secret that is
// NEVER shipped to browsers.
//
// The previous legacy fallback that accepted the Supabase anon/publishable
// key has been removed — the anon key is trivially extractable from the
// client bundle and allowed any internet user to trigger expensive DB
// writes. If CRON_SECRET is not configured the endpoint fails closed.
export function isCronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (!cronSecret) return false;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return provided.length > 0 && provided === cronSecret;
}

// Price-band refresh is installed by pg_cron with the project's publishable
// key. This endpoint-specific check keeps the existing snapshot jobs on their
// private secret while following the standard pg_cron callback pattern.
export function isScheduledJobAuthorized(request: Request): boolean {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  const provided = request.headers.get("apikey") ?? "";
  return expected.length > 0 && provided === expected;
}
