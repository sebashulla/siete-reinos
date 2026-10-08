import {fixture,migration} from './sql-fixture.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const directory=process.argv[2];if(!directory)throw new Error('Supply private backup directory');
const raw=await readFile(join(directory,'progress.json'),'utf8'),data=JSON.parse(raw),manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.sha256);
const db=await fixture();if(manifest.schemaVersion>=2)await db.exec(migration());
const users=JSON.parse(await readFile(join(directory,'auth-identities.json'),'utf8'));
for(const user of users)await db.query('insert into auth.users values($1)',[user.id]);
const tables=['profiles','campaigns','campaign_members','characters','rooms','room_members','room_join_limits','campaign_state','game_commits','campaign_audit'].filter(t=>data[t]);
await db.exec('begin');
for(const table of tables)for(const row of data[table]){
 const columns=Object.keys(row);assert.ok(columns.every(k=>/^[a-z_]+$/.test(k)));
 await db.query(`insert into public.${table}(${columns.map(k=>`"${k}"`).join(',')}) values(${columns.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));
}
await db.exec('commit');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const sorted=rows=>rows.map(row=>JSON.stringify(canonical(row))).sort();
for(const table of tables){const restored=(await db.query(`select to_jsonb(t) as row from public.${table} t`)).rows.map(r=>r.row);assert.deepEqual(sorted(restored),sorted(data[table]),`Exact restoration: ${table}`);}
await db.close();await writeFile(join(directory,'restore-verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),schemaVersion:manifest.schemaVersion,tables,exactApplicationRestoration:true,managedAuthRestoration:false},null,2));
console.log('Application backup restored exactly:',tables.length,'tables,',data.characters.length,'characters. Managed Auth requires the separate platform backup.');
