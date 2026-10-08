-- Los Siete Reinos v1. Run as postgres in Supabase SQL Editor.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (name ~ '^[A-Za-z0-9_]{3,18}$'),
  affinity text not null check (affinity in ('swordsman','mage')),
  appearance jsonb not null,
  level integer not null default 1 check (level between 1 and 100),
  xp integer not null default 0 check (xp >= 0),
  coins integer not null default 0 check (coins >= 0),
  inventory jsonb not null default '{"pocion":3,"feron":0,"auralita":0}',
  equipment jsonb not null,
  skills jsonb not null default '["sword","magic"]',
  updated_at timestamptz not null default now()
);
create unique index characters_unique_name on public.characters(lower(name));
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'adventure' check (mode = 'adventure'),
  closed boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id,user_id)
);
create index room_members_user_room on public.room_members(user_id,room_id);
create table public.room_join_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_join_limits enable row level security;
revoke all on public.profiles,public.characters,public.rooms,public.room_members,public.room_join_limits from anon,authenticated;
grant select on public.profiles,public.characters,public.rooms,public.room_members to authenticated;
-- No INSERT/UPDATE/DELETE grants for client roles, including progression JSON columns.
create policy profiles_self on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy characters_self on public.characters for select to authenticated using (user_id=(select auth.uid()));

create function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.room_members m join public.rooms r on r.id=m.room_id
    where m.room_id=p_room and m.user_id=auth.uid() and not r.closed);
$$;
revoke all on function public.is_room_member(uuid) from public,anon;
grant execute on function public.is_room_member(uuid) to authenticated;
create policy rooms_members on public.rooms for select to authenticated using (public.is_room_member(id));
create policy members_same_room on public.room_members for select to authenticated using (public.is_room_member(room_id));

create function public.valid_appearance(p jsonb) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(p)='object' and p->>'palette' in ('forest','ember','violet')
    and p->>'skin' in ('warm','deep','light') and (p - 'palette' - 'skin')='{}'::jsonb,false);
$$;
revoke all on function public.valid_appearance(jsonb) from public,anon,authenticated;
alter table public.characters add constraint characters_appearance check(public.valid_appearance(appearance));

create function public.create_character(p_name text,p_affinity text,p_appearance jsonb)
returns public.characters language plpgsql security definer set search_path='' as $$
declare result public.characters; player uuid:=auth.uid();
begin
  if player is null then raise exception 'Necesitas iniciar sesión'; end if;
  if p_name !~ '^[A-Za-z0-9_]{3,18}$' or p_name is null then raise exception 'El nombre debe tener 3–18 letras, números o guion bajo'; end if;
  if p_affinity is null or p_affinity not in ('swordsman','mage') or not public.valid_appearance(p_appearance) then raise exception 'Personaje inválido'; end if;
  insert into public.profiles(id) values(player) on conflict do nothing;
  insert into public.characters(user_id,name,affinity,appearance,equipment)
  values(player,p_name,p_affinity,p_appearance,case when p_affinity='mage' then '{"weapon":"baston","armor":"tunica"}'::jsonb else '{"weapon":"espada","armor":"cuero"}'::jsonb end)
  returning * into result;
  return result;
exception when unique_violation then raise exception 'El nombre ya existe o ya tienes un personaje';
end;
$$;
create function public.customize_character(p_appearance jsonb) returns public.characters
language plpgsql security definer set search_path='' as $$
declare result public.characters;
begin
  if auth.uid() is null or not public.valid_appearance(p_appearance) then raise exception 'Apariencia inválida'; end if;
  if exists(select 1 from public.room_members where user_id=auth.uid()) then raise exception 'Sal de la sala para personalizar tu personaje'; end if;
  update public.characters set appearance=p_appearance,updated_at=now() where user_id=auth.uid() returning * into result;
  if not found then raise exception 'Crea primero tu personaje'; end if;
  return result;
end;
$$;
create function public.create_room() returns public.rooms
language plpgsql security definer set search_path='' as $$
declare result public.rooms; c public.characters;
begin
  select * into c from public.characters where user_id=auth.uid() for update;
  if not found then raise exception 'Crea primero tu personaje'; end if;
  if exists(select 1 from public.room_members where user_id=auth.uid()) then raise exception 'Ya perteneces a una sala. Sal antes de crear otra'; end if;
  insert into public.rooms(owner_id) values(auth.uid()) returning * into result;
  insert into public.room_members(room_id,user_id,character_id) values(result.id,auth.uid(),c.id);
  return result;
end;
$$;
create function public.join_room(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result public.rooms; c public.characters; attempts_now integer;
begin
  select * into c from public.characters where user_id=auth.uid() for update;
  if not found then raise exception 'Crea primero tu personaje'; end if;
  -- Return failures, rather than raising them, so attempt counters are committed.
  insert into public.room_join_limits(user_id,attempts) values(auth.uid(),1)
  on conflict(user_id) do update set
    attempts=case when public.room_join_limits.window_start < now()-interval '1 minute' then 1 else public.room_join_limits.attempts+1 end,
    window_start=case when public.room_join_limits.window_start < now()-interval '1 minute' then now() else public.room_join_limits.window_start end
  returning attempts into attempts_now;
  if attempts_now>10 then return jsonb_build_object('error','Demasiados intentos. Espera un minuto'); end if;
  select * into result from public.rooms where code=upper(trim(p_code)) and not closed for update;
  if not found then return jsonb_build_object('error','Código de sala incorrecto o sala cerrada'); end if;
  if exists(select 1 from public.room_members where user_id=auth.uid() and room_id=result.id) then return to_jsonb(result); end if;
  if exists(select 1 from public.room_members where user_id=auth.uid()) then return jsonb_build_object('error','Sal de tu sala actual antes de unirte a otra'); end if;
  if (select count(*) from public.room_members where room_id=result.id)>=4 then return jsonb_build_object('error','La sala está completa (4 jugadores)'); end if;
  insert into public.room_members(room_id,user_id,character_id) values(result.id,auth.uid(),c.id);
  return to_jsonb(result);
end;
$$;
create function public.leave_room(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare next_owner uuid;
begin
  perform 1 from public.rooms where id=p_room for update;
  delete from public.room_members where room_id=p_room and user_id=auth.uid();
  if not found then return; end if;
  select user_id into next_owner from public.room_members where room_id=p_room order by joined_at limit 1;
  if next_owner is null then update public.rooms set closed=true where id=p_room;
  else update public.rooms set owner_id=next_owner where id=p_room and owner_id=auth.uid(); end if;
end;
$$;
create function public.room_roster(p_room uuid) returns table(user_id uuid,character_id uuid,name text,affinity text,appearance jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_room_member(p_room) then raise exception 'No perteneces a esta sala'; end if;
  return query select m.user_id,c.id,c.name,c.affinity,c.appearance
    from public.room_members m join public.characters c on c.id=m.character_id where m.room_id=p_room order by m.joined_at;
end;
$$;
create function public.schema_version() returns integer language sql immutable set search_path='' as $$ select 1; $$;

-- One topic per authenticated sender. A member cannot impersonate a peer by forging payload.user_id.
create function public.can_receive_player_topic(p_topic text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.room_members target join public.rooms r on r.id=target.room_id
    join public.room_members viewer on viewer.room_id=target.room_id and viewer.user_id=auth.uid()
    where not r.closed and p_topic='room:'||target.room_id::text||':player:'||target.user_id::text);
$$;
create function public.can_send_player_topic(p_topic text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.room_members m join public.rooms r on r.id=m.room_id
    where m.user_id=auth.uid() and not r.closed and p_topic='room:'||m.room_id::text||':player:'||m.user_id::text);
$$;
-- Realtime already enables RLS on realtime.messages; do not ALTER this Supabase-owned table.
create policy siete_reinos_receive on realtime.messages for select to authenticated
  using (extension in ('broadcast','presence') and public.can_receive_player_topic((select realtime.topic())));
create policy siete_reinos_send on realtime.messages for insert to authenticated
  with check (extension in ('broadcast','presence') and public.can_send_player_topic((select realtime.topic())));

revoke all on function public.create_character(text,text,jsonb),public.customize_character(jsonb),public.create_room(),public.join_room(text),public.leave_room(uuid),public.room_roster(uuid),public.schema_version(),public.can_receive_player_topic(text),public.can_send_player_topic(text) from public,anon;
grant execute on function public.create_character(text,text,jsonb),public.customize_character(jsonb),public.create_room(),public.join_room(text),public.leave_room(uuid),public.room_roster(uuid),public.schema_version(),public.can_receive_player_topic(text),public.can_send_player_topic(text) to authenticated;
commit;

-- IMPORTANT: Dashboard > Realtime > Settings > disable "Allow public access".
-- This prevents clients opening public channels to bypass private-channel RLS.
