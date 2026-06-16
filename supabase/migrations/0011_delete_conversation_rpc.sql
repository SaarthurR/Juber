-- Let a participant delete an entire chat thread and its messages.

create or replace function public.delete_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = auth.uid()
  ) then
    return false;
  end if;

  delete from public.conversations
  where id = p_conversation_id;

  return found;
end;
$$;

grant execute on function public.delete_conversation(uuid) to authenticated;
