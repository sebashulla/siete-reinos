import {fixture, migration} from './sql-fixture.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const directory=process.argv[2];if(!directory)throw new Error('Supply private backup directory');
const original=JSON.parse(await readFile(join(directory,'progress.json'),'utf8'));
const db=await fixture();
const catalog=JSON.parse(await readFile(join(directory,'live-catalog-and-auth.json'),'utf8'));
const normalizeDDL=s=>s.replace(/--[^\r\n]*/g,'').replace(/\s/g,'');
const localFunctions=(await db.query("select pg_get_functiondef(p.oid) as definition from pg_proc p where pronamespace='public'::regnamespace")).rows.map(r=>normalizeDDL(r.definition));
for(const definition of catalog.functions){assert.ok(localFunctions.includes(normalizeDDL(definition)),'Live schema differs from the restoration schema; do not migrate production.');await db.exec(definition);}
const localColumns=(await db.query("select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public'")).rows;
for(const c of catalog.columns)assert.ok(localColumns.some(l=>['table_name','column_name','data_type','is_nullable','column_default'].every(k=>l[k]===c[k])),'Live table structure differs from the restoration schema.');
const users=new Set(catalog.auth_users.map(u=>u.id));for(const c of original.characters)users.add(c.user_id);
for(const u of users)await db.query('insert into auth.users values($1)',[u]);
for(const [table,rows] of Object.entries(original))for(const row of rows){
 const keys=Object.keys(row);await db.query(`insert into public.${table}(${keys.map(k=>`"${k}"`).join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));
}
for(const [table,rows] of Object.entries(original)){
 const restored=(await db.query(`select to_jsonb(t) as row from public.${table} t`)).rows.map(r=>r.row);
 const normalize=r=>JSON.parse(JSON.stringify(r)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 // PostgreSQL JSONB key order differs; deep comparison handles that.
 assert.deepEqual(normalize(restored).sort((a,b)=>String(a.id??a.user_id).localeCompare(String(b.id??b.user_id))),normalize(rows).sort((a,b)=>String(a.id??a.user_id).localeCompare(String(b.id??b.user_id))));
}
await db.exec(migration());
const after=(await db.query('select to_jsonb(c) as row from characters c order by id')).rows.map(r=>{const {campaign_id,life_status,...c}=r.row;return c;});
assert.deepEqual(JSON.parse(JSON.stringify(after)),original.characters.sort((a,b)=>a.id.localeCompare(b.id)));
await db.close();await writeFile(join(directory,'restore-verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),tables:Object.keys(original),characters:after.length,restoration:true,migrationPreservesEveryOriginalField:true},null,2));
console.log('Private backup restored and v2 migration rehearsed: exact character preservation.');
