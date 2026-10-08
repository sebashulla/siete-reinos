import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const target=resolve(process.argv[2]??'');const rel=relative(process.cwd(),target);
if(!process.argv[2]||!rel.startsWith('..')&&!isAbsolute(rel))throw new Error('Supply a private backup directory OUTSIDE the repository.');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const data={};
for(const table of ['profiles','characters','rooms','room_members','room_join_limits']){
 const {data:rows,error}=await db.from(table).select('*');if(error)throw error;data[table]=rows;
}
const {data:users,error}=await db.auth.admin.listUsers({perPage:1000});if(error)throw error;
await mkdir(target,{recursive:true});
const raw=JSON.stringify(data,null,2);
await writeFile(join(target,'progress.json'),raw);await writeFile(join(target,'auth-identities.json'),JSON.stringify(users.users,null,2));
const schema=await readFile(new URL('../supabase/migrations/202610080001_initial.sql',import.meta.url),'utf8');
await writeFile(join(target,'application-schema.sql'),schema);
await writeFile(join(target,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),project:process.env.SUPABASE_URL,counts:Object.fromEntries(Object.entries(data).map(([t,r])=>[t,r.length])),sha256:createHash('sha256').update(raw).digest('hex'),scope:'Application tables and identity metadata. Managed Auth passwords, Storage and platform internals require a full pg_dump backup.'},null,2));
console.log('Private application backup saved outside repository. Characters:',data.characters.length);
