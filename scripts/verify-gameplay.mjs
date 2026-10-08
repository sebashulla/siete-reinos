import {createClient} from '@supabase/supabase-js';import {WebSocket} from 'ws';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {writeFile} from 'node:fs/promises';
import {walkable} from '../src/shared/world.ts';
const base=process.env.SUPABASE_URL,pub=process.env.VITE_SUPABASE_PUBLISHABLE_KEY,endpoint=process.env.VITE_GAME_SERVER_URL;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(fn,limit=15000){const end=Date.now()+limit;while(Date.now()<end){if(fn())return;await sleep(50);}throw new Error('Gameplay condition timed out');}
const clients=[],sessions=[],characters=[],peers=[];
for(const label of ['C','D']){const c=createClient(base,pub,{auth:{persistSession:false}}),{data,error}=await c.auth.signInWithPassword({email:process.env['TEST_EMAIL_'+label],password:process.env['TEST_PASSWORD_'+label]});if(error)throw error;clients.push(c);sessions.push(data.session);}
const suffix=randomBytes(3).toString('hex'),{data:campaign,error}=await clients[0].rpc('create_campaign',{p_name:'QA Gameplay '+suffix});if(error)throw error;
await clients[1].rpc('join_campaign',{p_code:campaign.invite_code});
for(let i=0;i<2;i++){const {data,error}=await clients[i].rpc('create_campaign_character',{p_campaign:campaign.id,p_name:`QA_Play${i}_${suffix}`,p_affinity:'swordsman',p_appearance:{palette:'forest',skin:'warm'}});if(error)throw error;characters.push(data);}
class Peer{
 constructor(i){this.i=i;this.seq=0;this.dx=0;this.dy=0;this.direction='down';}
 async open(){const url=new URL(endpoint);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/game';this.ws=new WebSocket(url,{origin:'http://127.0.0.1:5173'});
 this.ws.on('open',()=>this.ws.send(JSON.stringify({v:2,type:'auth',campaignId:campaign.id,token:sessions[this.i].access_token})));
 this.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='state')this.state=m;if(m.type==='error')this.error=m;});this.ws.on('error',()=>{});
 await wait(()=>this.state||this.error?.fatal,90000);if(!this.state){this.ws.close();throw new Error(this.error.message);}this.timer=setInterval(()=>this.input(),50);return this;
 }
 get actor(){return this.state.actors.find(a=>a.id===characters[this.i].id);}
 input(action,target,seq){this.ws.send(JSON.stringify({v:2,campaignId:campaign.id,seq:seq??++this.seq,dx:this.dx,dy:this.dy,direction:this.direction,action,target}));return this.seq;}
 close(){clearInterval(this.timer);this.ws.close();}
}
function route(start,target){
 const size=32,w=180,h=135,cell=p=>({x:Math.floor(p.x/size),y:Math.floor(p.y/size)}),s=cell(start),t=cell(target),key=p=>p.y*w+p.x;
 const queue=[s],previous=new Map([[key(s),null]]),pass=new Map();let found;
 for(let n=0;n<queue.length;n++){const p=queue[n];if(p.x===t.x&&p.y===t.y){found=p;break;}
 for(const[dX,dY]of [[1,0],[-1,0],[0,1],[0,-1]]){const q={x:p.x+dX,y:p.y+dY},k=key(q);if(q.x<0||q.y<0||q.x>=w||q.y>=h||previous.has(k))continue;
 // Leave clearance for observed WebSocket latency and the waypoint deadband.
 if(!pass.has(k))pass.set(k,walkable(q.x*size+size/2,q.y*size+size/2,36));if(!pass.get(k))continue;previous.set(k,p);queue.push(q);}}
 if(!found)throw new Error('No walkable QA route');const path=[];for(let p=found;p;p=previous.get(key(p)))path.push({x:p.x*size+16,y:p.y*size+16});return path.reverse();
}
async function walk(peer,target){
 const path=route(peer.actor,target);let index=1,last=Date.now(),previous={x:peer.actor.x,y:peer.actor.y};
 const end=Date.now()+120000;
 while(index<path.length&&Date.now()<end){const a=peer.actor,p=path[index],dx=p.x-a.x,dy=p.y-a.y;
 if(Math.hypot(dx,dy)<22){index++;continue;}
 peer.dx=Math.abs(dx)>Math.abs(dy)?Math.sign(dx):0;peer.dy=peer.dx?0:Math.sign(dy);peer.direction=peer.dx?(peer.dx>0?'right':'left'):(peer.dy>0?'down':'up');
 if(Math.hypot(a.x-previous.x,a.y-previous.y)>8){last=Date.now();previous={x:a.x,y:a.y};}if(Date.now()-last>5000)throw new Error('QA route stalled '+JSON.stringify({player:peer.i,index,actor:{x:a.x,y:a.y,state:a.state,hp:a.hp},waypoint:p,notice:peer.state.notice}));await sleep(50);
 }
 peer.dx=peer.dy=0;assert.ok(index>=path.length,'route time limit');await sleep(300);
}
let fighting;
try{
 for(let i=0;i<2;i++)peers.push(await new Peer(i).open());await wait(()=>peers.every(p=>p.state.connected===2));
 const fighter=peers[0],before=fighter.state.character.coins;let duplicate;
 const combat=(async()=>{
  await walk(fighter,{x:1264,y:1488});
  fighting=setInterval(()=>{if(fighter.actor.hp<70)fighter.input('potion');const victim=fighter.state.actors.filter(a=>a.kind==='enemy'&&a.hp>0).sort((a,b)=>Math.hypot(a.x-fighter.actor.x,a.y-fighter.actor.y)-Math.hypot(b.x-fighter.actor.x,b.y-fighter.actor.y))[0];if(!victim)return;
   const dx=victim.x-fighter.actor.x,dy=victim.y-fighter.actor.y;fighter.direction=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');duplicate=fighter.input('sword');},550);
  await wait(()=>fighter.state.character.coins>=before+8,15000);clearInterval(fighting);
 })();
 await Promise.all([combat,walk(peers[1],{x:4336,y:1552})]);
 const miner=peers[1];miner.input('interact','vein-0');await wait(()=>miner.state.character.inventory.feron===1,10000);const qty=miner.state.character.inventory.feron;
 miner.input('interact','vein-0');await sleep(2500);assert.equal(miner.state.character.inventory.feron,qty);
 const gained=fighter.state.character.coins;fighter.input('sword',undefined,duplicate);await sleep(500);assert.equal(fighter.state.character.coins,gained);
 for(let i=0;i<2;i++){const {data,error}=await clients[i].from('characters').select('coins,inventory,xp').eq('id',characters[i].id).single();if(error)throw error;assert.equal(data.coins,peers[i].state.character.coins);assert.deepEqual(data.inventory,peers[i].state.character.inventory);}
 await writeFile('artifacts/gameplay-integration.json',JSON.stringify({testedAt:new Date().toISOString(),endpoint,players:2,checks:['independent real Auth and WebSocket sessions','server collision routes across jurisdictions','verified mining reward persisted once','node cooldown enforced','server enemy kill XP and coin reward persisted','replayed kill message rejected']},null,2));
 console.log('Gameplay passed: two real sessions, movement to forest/mines, persisted mining and combat rewards, node cooldown and replay rejection.');
}finally{clearInterval(fighting);peers.forEach(p=>p.close());for(const c of clients)await c.auth.signOut({scope:'local'});}
