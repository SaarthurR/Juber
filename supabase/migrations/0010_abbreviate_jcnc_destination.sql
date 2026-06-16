-- Use the short community label in ride/request destinations.

alter table public.rides
  alter column destination_label set default 'JCNC';

alter table public.ride_requests
  alter column destination_label set default 'JCNC';

update public.rides
set destination_label = 'JCNC'
where destination_label = 'Jain Center of Northern California';

update public.ride_requests
set destination_label = 'JCNC'
where destination_label = 'Jain Center of Northern California';
