drop policy if exists "Approved users can read deals" on public.bulk_block_deals;
create policy "Approved users can read deals" on public.bulk_block_deals for select to authenticated
using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and (up.approved = true or up.is_admin = true)));

drop policy if exists "Authenticated can read band changes" on public.circuit_band_changes;
create policy "Approved users can read band changes" on public.circuit_band_changes for select to authenticated
using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and (up.approved = true or up.is_admin = true)));

drop policy if exists "Authenticated can read band history" on public.circuit_bands_history;
create policy "Approved users can read band history" on public.circuit_bands_history for select to authenticated
using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and (up.approved = true or up.is_admin = true)));

drop policy if exists "Authenticated users can read ingest status" on public.data_ingest_status;
create policy "Approved users can read ingest status" on public.data_ingest_status for select to authenticated
using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and (up.approved = true or up.is_admin = true)));