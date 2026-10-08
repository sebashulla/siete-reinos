import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
export async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema realtime;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
 create table realtime.messages(id bigint,extension text); alter table realtime.messages enable row level security;
 grant usage on schema auth,realtime to authenticated; grant select,insert on realtime.messages to authenticated;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/202610080001_initial.sql',import.meta.url),'utf8'));
 return db;
}
export async function asUser(db,id,fn){
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 try{return await fn();}finally{await db.exec('reset role');}
}
export const migration=()=>readFileSync(new URL('../supabase/migrations/202610080002_campaigns.sql',import.meta.url),'utf8');
