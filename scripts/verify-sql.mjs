import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth; create schema realtime;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
  create table realtime.messages(id bigint,extension text); alter table realtime.messages enable row level security;
  grant usage on schema auth,realtime to authenticated; grant select,insert on realtime.messages to authenticated;`);
await db.exec(readFileSync(new URL('../supabase/migrations/202610080001_initial.sql',import.meta.url),'utf8'));
const ids = Array.from({length:6},(_,i)=>`00000000-0000-4000-a000-00000000000${i+1}`);
for(const id of ids) await db.query('insert into auth.users(id) values($1)',[id]);
async function asUser(id, fn) {
  await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const chars=[];
for (let i=0;i<6;i++) chars.push(await asUser(ids[i],async()=> (await db.query(`select * from public.create_character($1,$2,$3)`,[`Hero_${i+1}`,i%2?'mage':'swordsman',{palette:'forest',skin:'warm'}])).rows[0]));
const room=await asUser(ids[0],async()=> (await db.query('select * from public.create_room()')).rows[0]);
for(let i=1;i<4;i++) await asUser(ids[i],async()=>assert.equal((await db.query('select public.join_room($1) as room',[room.code])).rows[0].room.id,room.id));
await asUser(ids[4],async()=>assert.match((await db.query('select public.join_room($1) as room',[room.code])).rows[0].room.error,/completa/));
await asUser(ids[1],async()=>{
  assert.equal((await db.query('select * from public.characters')).rows.length,1);
  assert.equal((await db.query('select * from public.room_roster($1)',[room.id])).rows.length,4);
  await assert.rejects(db.query('update public.characters set level=99 where user_id=$1',[ids[1]]),/permission denied/);
  await assert.rejects(db.query('update public.characters set coins=9999 where user_id=$1',[ids[0]]),/permission denied/);
  await assert.rejects(db.query('insert into public.room_members values($1,$2,$3,now())',[room.id,ids[4],chars[4].id]),/permission denied/);
  const own=`room:${room.id}:player:${ids[1]}`, other=`room:${room.id}:player:${ids[0]}`;
  assert.equal((await db.query('select public.can_send_player_topic($1) as allowed',[own])).rows[0].allowed,true);
  assert.equal((await db.query('select public.can_send_player_topic($1) as allowed',[other])).rows[0].allowed,false);
  assert.equal((await db.query('select public.can_receive_player_topic($1) as allowed',[other])).rows[0].allowed,true);
});
await asUser(ids[5],async()=>{
  assert.equal((await db.query('select * from public.rooms')).rows.length,0);
  await assert.rejects(db.query('select * from public.room_roster($1)',[room.id]),/No perteneces/);
  const topic=`room:${room.id}:player:${ids[0]}`;
  assert.equal((await db.query('select public.can_receive_player_topic($1) as allowed',[topic])).rows[0].allowed,false);
});
await asUser(ids[3],()=>db.query('select public.leave_room($1)',[room.id]));
await asUser(ids[4],async()=>assert.equal((await db.query('select public.join_room($1) as room',[room.code])).rows[0].room.id,room.id));
await asUser(ids[5],async()=>{
  for(let i=0;i<10;i++) await db.query('select public.join_room($1)',['INVALID']);
  assert.match((await db.query('select public.join_room($1) as room',['INVALID'])).rows[0].room.error,/Demasiados/);
});
await asUser(ids[5],()=>db.query('select public.customize_character($1)',[{palette:'violet',skin:'deep'}]));
await asUser(ids[3],async()=>{
  await assert.rejects(db.query('select public.customize_character($1)',[{palette:'forest',skin:'warm',level:99}]),/inválida/);
});
await asUser(ids[0],()=>db.query('select public.leave_room($1)',[room.id]));
await asUser(ids[1],async()=>assert.equal((await db.query('select owner_id from public.rooms where id=$1',[room.id])).rows[0].owner_id,ids[1]));
await db.close();
console.log('SQL verified: migration, own-only data, forbidden progression writes, 4-player capacity, roster authorization, sender isolation, join rate limit, appearance validation and owner transfer.');
