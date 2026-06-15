-- Create conversations and participants atomically so RLS does not block the
-- bootstrap step before participants exist.

create or replace function public.open_conversation(
  p_other_user_id uuid,
  p_ride_id uuid default null,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'Invalid conversation participant';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_other_user_id) then
    raise exception 'Conversation participant not found';
  end if;

  if p_ride_id is not null or p_request_id is not null then
    select c.id into v_conversation_id
    from public.conversations c
    where (p_ride_id is null or c.ride_id = p_ride_id)
      and (p_request_id is null or c.request_id = p_request_id)
      and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = c.id
          and cp.user_id = v_user_id
      )
      and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = c.id
          and cp.user_id = p_other_user_id
      )
    order by c.created_at
    limit 1;
  else
    select c.id into v_conversation_id
    from public.conversations c
    where exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = c.id
          and cp.user_id = v_user_id
      )
      and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = c.id
          and cp.user_id = p_other_user_id
      )
    order by c.created_at
    limit 1;
  end if;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (ride_id, request_id)
  values (p_ride_id, p_request_id)
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (v_conversation_id, v_user_id),
    (v_conversation_id, p_other_user_id);

  return v_conversation_id;
end;
$$;

grant execute on function public.open_conversation(uuid, uuid, uuid) to authenticated;
