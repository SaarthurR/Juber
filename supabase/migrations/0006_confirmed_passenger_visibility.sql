-- Let signed-in members see confirmed riders on a ride while keeping pending
-- and declined seat requests private to the passenger, driver, and admins.

drop policy if exists "passengers_select" on public.ride_passengers;
create policy "passengers_select" on public.ride_passengers
  for select to authenticated using (
    status = 'confirmed'
    or passenger_id = auth.uid()
    or exists (
      select 1 from public.rides r
      where r.id = ride_id
        and (r.driver_id = auth.uid() or public.is_admin())
    )
  );
