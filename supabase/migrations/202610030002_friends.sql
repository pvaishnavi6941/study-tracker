-- Ashvi friends: people directory, friend requests and a shared weekly board.
-- Apply in the Supabase SQL Editor after 202610030001_cadence.sql.
-- Other users' study data is never readable directly. The SECURITY DEFINER RPCs below
-- return only display name, and (for accepted friends only) streak, weekly hours and
-- whether a timer is running. Emails and session contents are never exposed.
begin;

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
-- One row per pair regardless of direction.
create unique index friendships_pair_idx on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);
create index friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;
create policy friendships_participant_read on public.friendships for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
-- No direct writes: every change goes through cadence_friend_action.
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

-- Internal helper: current streak (matches the app: completed sessions, today optional).
create function public.cadence_streak(u uuid, today date) returns integer
language sql stable security definer set search_path = '' as $$
with d as (
  select distinct study_date from public.study_sessions
  where user_id = u and completed and study_date <= today
), cur as (
  select case when exists (select 1 from d where study_date = today) then today else today - 1 end as day
), runs as (
  select study_date, study_date - (row_number() over (order by study_date))::int as grp from d
)
select coalesce((select count(*)::int from runs
  where grp = (select grp from runs, cur where study_date = cur.day)), 0);
$$;
revoke all on function public.cadence_streak(uuid, date) from public, anon, authenticated;

-- Everyone on Ashvi (display name only), plus the caller, with relation to the caller.
create function public.cadence_social(today date, week_start date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); result jsonb;
begin
  if me is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if week_start > today or week_start < today - 6 then raise exception 'Invalid week'; end if;
  select coalesce(jsonb_agg(m order by (m->>'rank_hours')::numeric desc nulls last, m->>'displayName'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', p.id,
      'displayName', p.display_name,
      'relation', case
        when p.id = me then 'self'
        when f.status = 'accepted' then 'friend'
        when f.status = 'pending' and f.requester_id = me then 'requested'
        when f.status = 'pending' then 'incoming'
        else 'none' end,
      'streak', case when p.id = me or f.status = 'accepted' then public.cadence_streak(p.id, today) end,
      'weekHours', case when p.id = me or f.status = 'accepted' then
        round(coalesce((select sum(s.duration_minutes) from public.study_sessions s
          where s.user_id = p.id and s.completed and s.study_date between week_start and today), 0) / 60, 1) end,
      'studyingNow', case when p.id = me or f.status = 'accepted' then p.active_timer is not null end,
      'rank_hours', case when p.id = me or f.status = 'accepted' then
        coalesce((select sum(s.duration_minutes) from public.study_sessions s
          where s.user_id = p.id and s.completed and s.study_date between week_start and today), 0) end
    ) as m
    from public.profiles p
    left join public.friendships f
      on (f.requester_id = me and f.addressee_id = p.id) or (f.addressee_id = me and f.requester_id = p.id)
    limit 500
  ) x;
  return result;
end;
$$;

-- request | accept | decline | cancel | remove, all atomic and caller-scoped.
create function public.cadence_friend_action(target uuid, action text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if target is null or target = me then raise exception 'Invalid person'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'Person not found'; end if;
  if action = 'request' then
    -- A request to someone who already asked you becomes an acceptance.
    update public.friendships set status = 'accepted', responded_at = now()
      where requester_id = target and addressee_id = me and status = 'pending';
    get diagnostics n = row_count;
    if n = 0 then
      insert into public.friendships(requester_id, addressee_id) values (me, target) on conflict do nothing;
    end if;
  elsif action = 'accept' then
    update public.friendships set status = 'accepted', responded_at = now()
      where requester_id = target and addressee_id = me and status = 'pending';
  elsif action = 'decline' then
    delete from public.friendships where requester_id = target and addressee_id = me and status = 'pending';
  elsif action = 'cancel' then
    delete from public.friendships where requester_id = me and addressee_id = target and status = 'pending';
  elsif action = 'remove' then
    delete from public.friendships where status = 'accepted'
      and ((requester_id = me and addressee_id = target) or (requester_id = target and addressee_id = me));
  else
    raise exception 'Unknown action';
  end if;
end;
$$;

revoke all on function public.cadence_social(date, date) from public, anon;
revoke all on function public.cadence_friend_action(uuid, text) from public, anon;
grant execute on function public.cadence_social(date, date) to authenticated;
grant execute on function public.cadence_friend_action(uuid, text) to authenticated;

commit;
