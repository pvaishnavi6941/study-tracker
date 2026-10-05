-- Video-course progress. Apply after the topic import migration.
-- A skill can optionally track a single video by total length and where the learner stopped.
-- Position is separate from study time: sessions still record actual elapsed duration.
begin;
alter table public.skills add column video_minutes numeric check (video_minutes is null or (video_minutes > 0 and video_minutes <= 600000));
alter table public.skills add column video_position numeric not null default 0 check (video_position >= 0);
alter table public.skills add constraint skills_video_position_within_length check (video_minutes is null or video_position <= video_minutes);
create or replace function public.cadence_snapshot() returns jsonb
language sql volatile security invoker set search_path = '' as $$
select jsonb_build_object(
  'revision',p.revision,'topicImportReady',true,
  'profile', jsonb_build_object('id',p.id,'displayName',p.display_name,'avatarUrl',p.avatar_url),
  'data', jsonb_build_object(
    'version',1,
    'preferences',jsonb_build_object('dailyTarget',p.daily_target_minutes,'onboardingDone',p.onboarding_done),
    'timer',p.active_timer,
    'skills',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'color',s.color,'targetHours',s.target_hours,'videoMinutes',s.video_minutes,'videoPosition',s.video_position,'createdAt',s.created_at) order by s.created_at,s.id) from public.skills s where s.user_id = p.id),'[]'::jsonb),
    'topics',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'skillId',t.skill_id,'name',t.name,'createdAt',t.created_at,'completedAt',t.completed_at,'priority',t.priority,'sortOrder',t.sort_order) order by t.sort_order,t.created_at,t.id) from public.topics t where t.user_id = p.id),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'skillId',s.skill_id,'topicId',s.topic_id,'topic',s.topic_name,'minutes',s.duration_minutes,'date',s.study_date,'time',left(s.study_time::text,5),'notes',s.notes,'completed',s.completed,'createdAt',s.created_at) order by s.study_date,s.study_time,s.id) from public.study_sessions s where s.user_id = p.id),'[]'::jsonb),
    'plans',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'topicId',q.topic_id,'date',q.study_date,'minutes',q.duration_minutes,'sessionId',q.session_id) order by q.study_date,q.created_at,q.id) from public.study_plans q where q.user_id = p.id),'[]'::jsonb)
  )
) from public.profiles p where p.id = (select auth.uid());
$$;


create or replace function public.cadence_apply_changes(expected_revision bigint, changes jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_revision bigint; r jsonb; t jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select revision into current_revision from public.profiles where id = owner_id for update;
  if not found then raise exception 'Cadence profile is missing'; end if;
  if current_revision <> expected_revision then
    raise exception 'Your study data changed on another device. Refresh and try again.' using errcode = '40001';
  end if;
  if jsonb_typeof(changes) <> 'object' then raise exception 'Invalid changes'; end if;

  -- Remove dependents first. Foreign keys protect cross-user references.
  delete from public.study_plans where user_id = owner_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(changes #> '{plans,delete}','[]'::jsonb)));
  delete from public.study_sessions where user_id = owner_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(changes #> '{sessions,delete}','[]'::jsonb)));
  delete from public.topics where user_id = owner_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(changes #> '{topics,delete}','[]'::jsonb)));
  delete from public.skills where user_id = owner_id and id in (select value::uuid from jsonb_array_elements_text(coalesce(changes #> '{skills,delete}','[]'::jsonb)));

  for r in select value from jsonb_array_elements(coalesce(changes #> '{skills,upsert}','[]'::jsonb)) loop
    insert into public.skills(id,user_id,name,color,target_hours,video_minutes,video_position,created_at)
    values ((r->>'id')::uuid,owner_id,r->>'name',r->>'color',(r->>'targetHours')::numeric,(r->>'videoMinutes')::numeric,coalesce((r->>'videoPosition')::numeric,0),(r->>'createdAt')::timestamptz)
    on conflict (id) do update set name=excluded.name,color=excluded.color,target_hours=excluded.target_hours,video_minutes=excluded.video_minutes,video_position=excluded.video_position;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(changes #> '{topics,upsert}','[]'::jsonb)) loop
    insert into public.topics(id,user_id,skill_id,name,completed,completed_at,created_at,priority,sort_order)
    values ((r->>'id')::uuid,owner_id,(r->>'skillId')::uuid,r->>'name',r->>'completedAt' is not null,(r->>'completedAt')::timestamptz,(r->>'createdAt')::timestamptz,coalesce(r->>'priority','Medium'),coalesce((r->>'sortOrder')::integer,(select coalesce(max(sort_order),-1)+1 from public.topics where user_id=owner_id)))
    on conflict (id) do update set skill_id=excluded.skill_id,name=excluded.name,completed=excluded.completed,completed_at=excluded.completed_at,priority=coalesce(r->>'priority',topics.priority),sort_order=coalesce((r->>'sortOrder')::integer,topics.sort_order);
  end loop;
  for r in select value from jsonb_array_elements(coalesce(changes #> '{sessions,upsert}','[]'::jsonb)) loop
    insert into public.study_sessions(id,user_id,skill_id,topic_id,topic_name,duration_minutes,notes,started_at,study_date,study_time,completed,created_at)
    values ((r->>'id')::uuid,owner_id,(r->>'skillId')::uuid,(r->>'topicId')::uuid,r->>'topic',(r->>'minutes')::numeric,r->>'notes',(r->>'startedAt')::timestamptz,(r->>'date')::date,(r->>'time')::time,(r->>'completed')::boolean,(r->>'createdAt')::timestamptz)
    on conflict (id) do update set skill_id=excluded.skill_id,topic_id=excluded.topic_id,topic_name=excluded.topic_name,duration_minutes=excluded.duration_minutes,notes=excluded.notes,started_at=excluded.started_at,study_date=excluded.study_date,study_time=excluded.study_time,completed=excluded.completed;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(changes #> '{plans,upsert}','[]'::jsonb)) loop
    insert into public.study_plans(id,user_id,topic_id,study_date,duration_minutes,session_id)
    values ((r->>'id')::uuid,owner_id,(r->>'topicId')::uuid,(r->>'date')::date,(r->>'minutes')::integer,(r->>'sessionId')::uuid)
    on conflict (id) do update set topic_id=excluded.topic_id,study_date=excluded.study_date,duration_minutes=excluded.duration_minutes,session_id=excluded.session_id;
  end loop;
  if changes ? 'preferences' then
    update public.profiles set daily_target_minutes=(changes #>> '{preferences,dailyTarget}')::integer,
      onboarding_done=(changes #>> '{preferences,onboardingDone}')::boolean where id=owner_id;
  end if;
  if changes ? 'timer' then
    t := nullif(changes->'timer','null'::jsonb);
    if t is not null then
      if jsonb_typeof(t) <> 'object' or not exists(select 1 from public.skills where user_id=owner_id and id=(t->>'skillId')::uuid)
        or (t->>'topicId' is not null and not exists(select 1 from public.topics where user_id=owner_id and id=(t->>'topicId')::uuid and skill_id=(t->>'skillId')::uuid))
        or (t->>'planId' is not null and not exists(select 1 from public.study_plans where user_id=owner_id and id=(t->>'planId')::uuid)) then
        raise exception 'Invalid timer reference';
      end if;
    end if;
    update public.profiles set active_timer=t where id=owner_id;
  end if;
  -- A final increment covers preference/timer-only saves and full resets.
  update public.profiles set revision=revision+1 where id=owner_id;
  return public.cadence_snapshot();
end;
$$;

commit;
