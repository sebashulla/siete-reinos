import {createClient} from '@supabase/supabase-js';
import {WebSocket} from 'ws';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const remote=process.argv.includes('--remote');
const base=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;
const publishable=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(!base||!secret||!publishable)throw new Error('Load ignored .env.local and .env.server.local');
const admin=createClient(base,secret,{auth:{persistSession:false}});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await sleep(50);}throw new Error('Integration condition timed out');}
const clients=[],identities=[],characters=[];
for(let i=0;i<4;i++){
 const label='ABCD'[i];let email=process.env[`TEST_EMAIL_${label}`],password=process.env[`TEST_PASSWORD_${label}`];
 if(!email||!password){if(i<2)throw new Error('Existing QA A/B credentials required');
  email=`qa.authority.${label.toLowerCase()}.${randomBytes(4).toString('hex')}@example.com`;password=randomBytes(24).toString('base64url');
  const {error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;
  const local=await readFile('.env.local','utf8');await writeFile('.env.local',local+`\nTEST_EMAIL_${label}=${email}\nTEST_PASSWORD_${label}=${password}\n`);
 }
 const client=createClient(base,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;
 clients.push(client);identities.push(data);
}
const marker=randomBytes(3).toString('hex');
const {data:campaign,error:campaignError}=await clients[0].rpc('create_campaign',{p_name:`QA Authority ${marker}`});if(campaignError)throw campaignError;
for(let i=1;i<4;i++){const {data,error}=await clients[i].rpc('join_campaign',{p_code:campaign.invite_code});if(error||data.error)throw error??new Error(data.error);}
for(let i=0;i<4;i++){
 const {data:legacy,error:legacyError}=await clients[i].from('characters').select('*').is('campaign_id',null).maybeSingle();if(legacyError)throw legacyError;
 let c;
 if(legacy){const {data,error}=await clients[i].rpc('claim_legacy_character',{p_character:legacy.id,p_campaign:campaign.id});if(error)throw error;c=data;
  for(const key of ['id','name','appearance','level','xp','coins','equipment','inventory','skills','updated_at'])assert.deepEqual(c[key],legacy[key]);
 }else{const {data,error}=await clients[i].rpc('create_campaign_character',{p_campaign:campaign.id,p_name:`QA_${'ABCD'[i]}_${marker}`,p_affinity:i%2?'mage':'swordsman',p_appearance:{palette:i%2?'violet':'forest',skin:'warm'}});if(error)throw error;c=data;}
 characters.push(c);
}
const {data:isolated,error:isolatedError}=await clients[3].rpc('create_campaign',{p_name:`QA Isolated ${marker}`});if(isolatedError)throw isolatedError;
const forbidden=await clients[0].from('campaigns').select('*').eq('id',isolated.id);assert.equal(forbidden.data.length,0);
const overwrite=await clients[1].from('characters').update({coins:99999}).eq('id',characters[0].id);assert.ok(overwrite.error);
let child,proxy,dropResponse=false,failCommits=false,dropped=0;
if(!remote){
 proxy=createServer(async(req,res)=>{try{
   if(failCommits&&req.url.includes('commit_game_state')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'QA persistence outage'}));return;}
   const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
   const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
   const response=await fetch(base+req.url,{method:req.method,headers,...body.length?{body}:{}});const raw=Buffer.from(await response.arrayBuffer());
   if(dropResponse&&req.url.includes('commit_game_state')&&response.ok){dropResponse=false;dropped++;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'QA lost acknowledgement'}));return;}
   res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')??'application/json'});res.end(raw);
 }catch{res.writeHead(503);res.end();}});
 await new Promise(resolve=>proxy.listen(3002,'127.0.0.1',resolve));
}
const endpoint=remote?process.env.VITE_GAME_SERVER_URL:'http://127.0.0.1:3001';if(!endpoint)throw new Error('Game server URL missing');
async function start(){if(remote)return;child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,SUPABASE_URL:'http://127.0.0.1:3002',PORT:'3001'},stdio:['ignore','pipe','pipe']});
 await until(async()=>{try{return (await fetch(endpoint+'/healthz')).ok;}catch{return false;}},15000);}
async function stop(){if(child){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;child=undefined;}}
class Peer{
 constructor(i,campaignId=campaign.id){this.i=i;this.campaignId=campaignId;this.seq=0;this.frames=[];this.errors=[];this.closed=false;}
 async open(){const u=new URL(endpoint);u.protocol=u.protocol==='https:'?'wss:':'ws:';u.pathname='/game';this.ws=new WebSocket(u,{origin:'http://127.0.0.1:5173'});
  this.ws.on('open',()=>this.ws.send(JSON.stringify({v:2,type:'auth',campaignId:this.campaignId,token:identities[this.i].session.access_token})));
  this.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='state'){this.state=m;this.frames.push(Date.now());}if(m.type==='error'){this.errors.push(m.message);if(m.fatal){this.rejection=m;this.ws.close();}}});
  this.ws.on('close',(code,reason)=>{this.closed=code;this.closeReason=reason.toString();});this.ws.on('error',()=>{});
  await until(()=>this.state||this.closed||this.rejection);return this;
 }
 input(dx=0,dy=0,direction='down',action,target,extra={}){const m={v:2,campaignId:this.campaignId,seq:++this.seq,dx,dy,direction,action,target,...extra};this.ws.send(JSON.stringify(m));return m;}
 close(){this.ws?.close();}
}
const peers=[];const report={testedAt:new Date().toISOString(),remote,checks:[]};
try{
 await start();const health=await (await fetch(endpoint+'/healthz')).json();assert.equal(health.protocol,2);report.health=health;
 for(let i=0;i<4;i++)peers.push(await new Peer(i).open());
 await until(()=>peers.every(p=>p.state?.connected===4));report.checks.push('four independent Supabase Auth identities over real WebSockets');
 const starts=peers.map((p,i)=>p.state.actors.find(a=>a.id===characters[i].id));const directions=[[1,0,'right'],[0,1,'down'],[-1,0,'left'],[0,-1,'up']];
 const before=Date.now(),timers=peers.map((p,i)=>setInterval(()=>p.input(...directions[i]),50));await sleep(2000);timers.forEach(clearInterval);peers.forEach(p=>p.input());await sleep(500);
 for(let i=0;i<4;i++){const a=peers[i].state.actors.find(a=>a.id===characters[i].id),d=Math.hypot(a.x-starts[i].x,a.y-starts[i].y);assert.ok(d>35&&d<340,`authoritative speed/collision ${i}: ${d}`);
  for(const p of peers){const other=p.state.actors.find(b=>b.id===a.id);assert.ok(other);assert.equal(other.hp,a.hp);assert.ok(Math.hypot(other.x-a.x,other.y-a.y)<20);}
  const frames=peers[i].frames.filter(t=>t>before&&t<before+2000).length;assert.ok(frames>=15&&frames<=24,`10 Hz snapshot rate: ${frames}`);
 }
 report.checks.push('four-player motion, shared HP, proximity and 10 Hz snapshots');
 // Reach a real guard through valid movement; attack once and compare its HP.
 const actor=()=>peers[0].state.actors.find(a=>a.id===characters[0].id);
 await until(()=>{const a=actor();if(Math.abs(a.x-3040)<10)return true;peers[0].input(a.x>3040?-1:1,0,a.x>3040?'left':'right');return false;},5000);
 peers[0].input();await sleep(300);const guardBefore=peers[0].state.actors.find(a=>a.id==='guard-valdoria').hp;
 const attack=peers[0].input(0,0,'down','sword');
 await until(()=>peers.every(p=>p.state.actors.find(a=>a.id==='guard-valdoria')?.hp<guardBefore));
 const hp=peers[0].state.actors.find(a=>a.id==='guard-valdoria').hp;peers[0].ws.send(JSON.stringify(attack));await sleep(300);assert.equal(peers[0].state.actors.find(a=>a.id==='guard-valdoria').hp,hp);
 report.checks.push('server-validated damage shared across all four; repeated message rejected');
 const coins=peers[0].state.character.coins;peers[0].input(0,0,'down',undefined,undefined,{x:999999,hp:99999,coins:999999});await sleep(300);assert.equal(peers[0].state.character.coins,coins);
 const intruder=await new Peer(0,isolated.id).open();assert.equal(intruder.rejection?.code??intruder.closed,4003);await sleep(300);assert.equal(intruder.state,undefined);intruder.close();report.checks.push('cross-campaign channel access and forged stats rejected; PostgreSQL RLS');
 await until(()=>actor().state==='jailed',7000);
 if(!remote){
  const old=peers[0].state.cases.at(-1).jailUntil;dropResponse=true;peers[0].input(0,0,'down','work');
  await until(()=>dropped===1);await until(()=>peers[0].state.cases.at(-1).jailUntil===old-15000);
  assert.equal(peers[0].state.cases.at(-1).jailUntil,old-15000);report.checks.push('lost commit acknowledgement retried idempotently without double work credit');
  failCommits=true;peers[0].input(0,0,'down','appeal',peers[0].state.cases.at(-1).id);await until(()=>peers[0].errors.length>0);
  const previous=peers[0].state.cases.at(-1).jailUntil;peers[0].input(0,0,'down','work');await sleep(1200);assert.equal(peers[0].state.cases.at(-1).jailUntil,previous);
  failCommits=false;await until(()=>peers[0].state.cases.at(-1).status==='appealed');report.checks.push('persistence outage suspends critical actions and unpublished sentences; recovery');
  const restoredCase=structuredClone(peers[0].state.cases.at(-1)),inventory=structuredClone(peers[0].state.character.inventory);
  peers.forEach(p=>p.close());await sleep(300);await stop();await start();let recovered;
  await until(async()=>{const p=await new Peer(0).open();if(p.state){recovered=p;return true;}assert.equal(p.rejection?.code??p.closed,4010,JSON.stringify(p.errors));p.close();await sleep(1000);return false;},30000);
  assert.deepEqual(recovered.state.character.inventory,inventory);assert.equal(recovered.state.cases.at(-1).jailUntil,restoredCase.jailUntil);assert.equal(recovered.state.cases.at(-1).status,restoredCase.status);recovered.close();
  report.checks.push('server restart restores inventory, case, UTC deadline and authority epoch');
 }
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/authority-integration'+(remote?'-render':'')+'.json',JSON.stringify(report,null,2));
 console.log('Authoritative integration passed:',report.checks.join('; '));
}finally{peers.forEach(p=>p.close());await stop();proxy?.close();for(const c of clients)await c.auth.signOut();}
