import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const target=resolve(process.argv[2]??'');const rel=relative(process.cwd(),target);
if(!process.argv[2]||!rel.startsWith('..')&&!isAbsolute(rel))throw new Error('Supply a private backup directory OUTSIDE the repository.');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const {data:version,error:versionError}=await db.rpc('schema_version');if(versionError)throw versionError;
const data={},tables=['profiles','characters','rooms','room_members','room_join_limits'];
if(version>=2)tables.push('campaigns','campaign_members','campaign_state','game_commits','campaign_audit');
for(const table of tables){
 data[table]=[];
 const keys={campaign_members:['campaign_id','user_id'],campaign_state:['campaign_id'],game_commits:['campaign_id','event_id'],campaign_audit:['campaign_id','event_id'],room_members:['user_id'],room_join_limits:['user_id']}[table]??['id'];
 for(let from=0;;from+=1000){let query=db.from(table).select('*').range(from,from+999);for(const key of keys)query=query.order(key);const {data:rows,error}=await query;if(error)throw error;data[table].push(...rows);if(rows.length<1000)break;}
}
const users=[];for(let page=1;;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});if(error)throw error;users.push(...data.users);if(data.users.length<1000)break;}
await mkdir(target,{recursive:true});
const raw=JSON.stringify(data,null,2);
await writeFile(join(target,'progress.json'),raw);await writeFile(join(target,'auth-identities.json'),JSON.stringify(users,null,2));
const schema=await readFile(new URL('../supabase/migrations/202610080001_initial.sql',import.meta.url),'utf8');
await writeFile(join(target,'application-schema.sql'),schema);
if(version>=2)await writeFile(join(target,'campaign-schema.sql'),await readFile(new URL('../supabase/migrations/202610080002_campaigns.sql',import.meta.url),'utf8'));
await writeFile(join(target,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),schemaVersion:version,project:process.env.SUPABASE_URL,counts:Object.fromEntries(Object.entries(data).map(([t,r])=>[t,r.length])),sha256:createHash('sha256').update(raw).digest('hex'),scope:'Application tables and identity metadata. Take while games are disconnected; REST exports are not a cross-table transaction. Managed Auth passwords, Storage and platform internals require a full pg_dump backup.'},null,2));
console.log('Private application backup saved outside repository. Characters:',data.characters.length);
