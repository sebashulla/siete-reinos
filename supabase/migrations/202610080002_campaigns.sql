-- Additive v2 migration. Existing character data is never reset or copied.
begin;
create table public.campaigns (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 3 and 60),
 invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
 owner_id uuid not null references auth.users(id), mode text not null default 'casual' check(mode in ('casual','hardcore')),
 rules_version integer not null default 1, created_at timestamptz not null default now()
);
create table public.campaign_members (
 campaign_id uuid not null references public.campaigns(id), user_id uuid not null references auth.users(id),
 role text not null default 'member' check(role in ('owner','member')), consent_version integer,
 joined_at timestamptz not null default now(), primary key(campaign_id,user_id)
);
alter table public.characters add column campaign_id uuid references public.campaigns(id);
alter table public.characters add column life_status text not null default 'active' check(life_status in ('active','executed'));
alter table public.characters drop constraint characters_user_id_key;
create unique index characters_active_campaign on public.characters(user_id,campaign_id) where life_status='active';
create unique index characters_unassigned on public.characters(user_id) where campaign_id is null;
create table public.campaign_state (
 campaign_id uuid primary key references public.campaigns(id), revision bigint not null default 0,
 state jsonb not null default '{}', instance_id text, epoch bigint not null default 0, lease_until timestamptz
);
create table public.game_commits (
 campaign_id uuid not null references public.campaigns(id), event_id text not null, revision bigint not null,
 critical_delta jsonb not null default '{}',
 created_at timestamptz not null default now(), primary key(campaign_id,event_id)
);
create table public.campaign_audit (
 campaign_id uuid not null references public.campaigns(id), event_id text not null,
 event jsonb not null, created_at timestamptz not null default now(), primary key(campaign_id,event_id)
);
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_state enable row level security;
alter table public.game_commits enable row level security;
alter table public.campaign_audit enable row level security;
revoke all on public.campaigns,public.campaign_members,public.campaign_state,public.game_commits,public.campaign_audit from anon,authenticated;
grant select on public.campaigns,public.campaign_members to authenticated;
create function public.is_campaign_member(p_campaign uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.campaign_members where campaign_id=p_campaign and user_id=(select auth.uid()));
$$;
revoke all on function public.is_campaign_member(uuid) from public,anon;
grant execute on function public.is_campaign_member(uuid) to authenticated;
create policy campaigns_member on public.campaigns for select to authenticated using(public.is_campaign_member(id));
create policy campaign_roster_member on public.campaign_members for select to authenticated using(public.is_campaign_member(campaign_id));
-- Private world state/evidence are served through the authenticated game server only.
create function public.create_campaign(p_name text,p_mode text default 'casual',p_consent integer default null) returns public.campaigns language plpgsql security definer set search_path='' as $$
declare c public.campaigns; u uuid:=auth.uid();
begin
 if u is null then raise exception 'Inicia sesión'; end if;
 if p_mode not in ('casual','hardcore') then raise exception 'Modo inválido'; end if;
 if p_mode='hardcore' and p_consent is distinct from 1 then raise exception 'Debes aceptar las reglas hardcore v1'; end if;
 if (select count(*) from public.campaigns where owner_id=u)>=20 then raise exception 'Máximo de 20 campañas'; end if;
 insert into public.campaigns(name,owner_id,mode) values(trim(p_name),u,p_mode) returning * into c;
 insert into public.campaign_members(campaign_id,user_id,role,consent_version) values(c.id,u,'owner',case when p_mode='hardcore' then p_consent else null end);
 insert into public.campaign_state(campaign_id) values(c.id);
 return c;
end; $$;
create function public.join_campaign(p_code text,p_consent integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.campaigns; u uuid:=auth.uid(); tries integer;
begin
 if u is null then raise exception 'Inicia sesión'; end if;
 insert into public.room_join_limits(user_id,attempts) values(u,1) on conflict(user_id) do update set
 attempts=case when public.room_join_limits.window_start<now()-interval '1 minute' then 1 else public.room_join_limits.attempts+1 end,
 window_start=case when public.room_join_limits.window_start<now()-interval '1 minute' then now() else public.room_join_limits.window_start end returning attempts into tries;
 if tries>10 then return jsonb_build_object('error','Demasiados intentos. Espera un minuto'); end if;
 select * into c from public.campaigns where invite_code=upper(trim(p_code)) for update;
 if not found then return jsonb_build_object('error','Invitación incorrecta'); end if;
 if c.mode='hardcore' and p_consent is distinct from c.rules_version then
   return jsonb_build_object('error','Esta campaña hardcore requiere aceptar sus reglas', 'consent_required',true,'rules_version',c.rules_version);
 end if;
 if not exists(select 1 from public.campaign_members where campaign_id=c.id and user_id=u) and
 (select count(*) from public.campaign_members where campaign_id=c.id)>=4 then return jsonb_build_object('error','La campaña está completa (4 miembros)'); end if;
 insert into public.campaign_members(campaign_id,user_id,consent_version) values(c.id,u,p_consent)
 on conflict(campaign_id,user_id) do update set consent_version=excluded.consent_version;
 return to_jsonb(c);
end; $$;
create function public.claim_legacy_character(p_character uuid,p_campaign uuid) returns public.characters language plpgsql security definer set search_path='' as $$
declare c public.characters;
begin
 if not public.is_campaign_member(p_campaign) or not exists(select 1 from public.campaigns where id=p_campaign and mode='casual') then raise exception 'Selecciona una campaña casual autorizada'; end if;
 select * into c from public.characters where id=p_character and user_id=auth.uid() for update;
 if not found then raise exception 'Personaje no autorizado'; end if;
 if c.campaign_id=p_campaign then return c; end if;
 if c.campaign_id is not null then raise exception 'El personaje ya está vinculado a otra campaña'; end if;
 update public.characters set campaign_id=p_campaign where id=c.id returning * into c;
 return c;
end; $$;
create function public.create_campaign_character(p_campaign uuid,p_name text,p_affinity text,p_appearance jsonb) returns public.characters language plpgsql security definer set search_path='' as $$
declare c public.characters; u uuid:=auth.uid();
begin
 if not public.is_campaign_member(p_campaign) then raise exception 'Campaña no autorizada'; end if;
 if not public.valid_appearance(p_appearance) or p_affinity not in ('swordsman','mage') then raise exception 'Personaje inválido'; end if;
 insert into public.profiles(id) values(u) on conflict do nothing;
 insert into public.characters(user_id,campaign_id,name,affinity,appearance,equipment)
 values(u,p_campaign,trim(p_name),p_affinity,p_appearance,case when p_affinity='mage' then '{"weapon":"baston","armor":"tunica"}'::jsonb else '{"weapon":"espada","armor":"cuero"}'::jsonb end) returning * into c;
 return c;
end; $$;
create function public.customize_campaign_character(p_character uuid,p_appearance jsonb) returns public.characters language plpgsql security definer set search_path='' as $$
declare c public.characters;
begin
 if not public.valid_appearance(p_appearance) then raise exception 'Apariencia inválida'; end if;
 update public.characters set appearance=p_appearance,updated_at=now() where id=p_character and user_id=auth.uid() and life_status='active' returning * into c;
 if not found then raise exception 'Personaje no autorizado'; end if; return c;
end; $$;
-- Old mutation endpoints cannot ambiguously affect several campaign characters.
create or replace function public.customize_character(p_appearance jsonb) returns public.characters language plpgsql security definer set search_path='' as $$
begin raise exception 'Actualiza el juego para seleccionar tu campaña'; end; $$;
create or replace function public.create_character(p_name text,p_affinity text,p_appearance jsonb) returns public.characters language plpgsql security definer set search_path='' as $$
begin raise exception 'Selecciona una campaña antes de crear tu personaje'; end; $$;
revoke execute on function public.create_room(),public.join_room(text),public.leave_room(uuid) from authenticated;
drop policy siete_reinos_receive on realtime.messages;
drop policy siete_reinos_send on realtime.messages;
create or replace function public.schema_version() returns integer language sql immutable set search_path='' as $$select 2;$$;
revoke all on function public.create_campaign(text,text,integer),public.join_campaign(text,integer),public.claim_legacy_character(uuid,uuid),public.create_campaign_character(uuid,text,text,jsonb),public.customize_campaign_character(uuid,jsonb) from public,anon;
grant execute on function public.create_campaign(text,text,integer),public.join_campaign(text,integer),public.claim_legacy_character(uuid,uuid),public.create_campaign_character(uuid,text,text,jsonb),public.customize_campaign_character(uuid,jsonb) to authenticated;
-- Fenced leases also protect rolling deploys: only the current holder may commit.
create function public.acquire_game_lease(p_campaign uuid,p_instance text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.campaign_state;
begin
 select * into s from public.campaign_state where campaign_id=p_campaign for update;
 if not found then raise exception 'Estado de campaña inexistente'; end if;
 if s.lease_until>now() and s.instance_id is distinct from p_instance then raise exception 'Campaña recuperándose; vuelve a conectar'; end if;
 update public.campaign_state set epoch=case when instance_id is distinct from p_instance or lease_until<=now() then epoch+1 else epoch end,
 instance_id=p_instance,lease_until=now()+interval '20 seconds' where campaign_id=p_campaign returning * into s;
 return jsonb_build_object('epoch',s.epoch,'revision',s.revision,'state',s.state);
end; $$;
create function public.commit_game_state(p_campaign uuid,p_instance text,p_epoch bigint,p_expected bigint,p_event text,p_state jsonb,p_audit jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare s public.campaign_state; existing bigint; player jsonb; event jsonb; changes jsonb:='{}'; entry record; prior jsonb; critical jsonb;
begin
 select * into s from public.campaign_state where campaign_id=p_campaign for update;
 if s.instance_id is distinct from p_instance or s.epoch<>p_epoch or s.lease_until<=now() then raise exception 'Autoridad caducada'; end if;
 select revision into existing from public.game_commits where campaign_id=p_campaign and event_id=p_event;
 if found then return existing; end if;
 if s.revision<>p_expected then raise exception 'Revisión de mundo incompatible'; end if;
 for entry in select key,value from jsonb_each(p_state->'players') loop
  prior:=s.state->'players'->entry.key;
  critical:=jsonb_build_object('character',entry.value->'character','lots',entry.value->'lots','hp',entry.value->'actor'->'hp','status',entry.value->'actor'->'state','downUntil',entry.value->'downUntil','permitUntil',entry.value->'permitUntil','reputation',entry.value->'reputation');
  if critical is distinct from jsonb_build_object('character',prior->'character','lots',prior->'lots','hp',prior->'actor'->'hp','status',prior->'actor'->'state','downUntil',prior->'downUntil','permitUntil',prior->'permitUntil','reputation',prior->'reputation') then changes:=jsonb_set(changes,array[entry.key],critical); end if;
 end loop;
 changes:=jsonb_build_object('players',changes);
 for entry in select key,value from jsonb_each(p_state) where key in ('cases','realms','events','forge','nodeUntil') loop
  if entry.value is distinct from s.state->entry.key then changes:=jsonb_set(changes,array[entry.key],entry.value); end if;
 end loop;
 for player in select value from jsonb_each(p_state->'players') loop
  if not exists(select 1 from public.campaign_members where campaign_id=p_campaign and user_id=(player->'character'->>'user_id')::uuid) then raise exception 'Miembro no autorizado'; end if;
  update public.characters set level=(player->'character'->>'level')::integer,xp=(player->'character'->>'xp')::integer,
   coins=(player->'character'->>'coins')::integer,inventory=player->'character'->'inventory',equipment=player->'character'->'equipment',
   skills=player->'character'->'skills',life_status=coalesce(player->'character'->>'life_status','active'),updated_at=now()
   where id=(player->'character'->>'id')::uuid and campaign_id=p_campaign and user_id=(player->'character'->>'user_id')::uuid;
  if not found then raise exception 'Personaje ajeno a la campaña'; end if;
 end loop;
 for event in select value from jsonb_array_elements(p_audit) loop
  insert into public.campaign_audit(campaign_id,event_id,event) values(p_campaign,event->>'eventId',event) on conflict do nothing;
 end loop;
 update public.campaign_state set state=p_state,revision=revision+1 where campaign_id=p_campaign;
 insert into public.game_commits(campaign_id,event_id,revision,critical_delta) values(p_campaign,p_event,p_expected+1,changes);
 return p_expected+1;
end; $$;
create function public.release_game_lease(p_campaign uuid,p_instance text,p_epoch bigint) returns void language sql security definer set search_path='' as $$
 update public.campaign_state set lease_until=now() where campaign_id=p_campaign and instance_id=p_instance and epoch=p_epoch;
$$;
revoke all on function public.acquire_game_lease(uuid,text),public.commit_game_state(uuid,text,bigint,bigint,text,jsonb,jsonb),public.release_game_lease(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.acquire_game_lease(uuid,text),public.commit_game_state(uuid,text,bigint,bigint,text,jsonb,jsonb),public.release_game_lease(uuid,text,bigint) to service_role;
grant all on public.campaigns,public.campaign_members,public.campaign_state,public.game_commits,public.campaign_audit to service_role;
commit;
