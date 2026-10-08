import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {createClient} from '@supabase/supabase-js';
import type {Campaign,Character} from '../src/data/types';
import {parseInput,PROTOCOL_VERSION,RULES_VERSION} from '../src/shared/protocol';
import {WorldEngine,type SavedWorld} from './engine';
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
if(!url||!key||key==='replace_me')throw new Error('Configure SUPABASE_URL and SUPABASE_SECRET_KEY in server environment only.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const instance=randomUUID(),runtimes=new Map<string,Runtime>();
const allowedOrigins=(process.env.ALLOWED_ORIGINS??'http://127.0.0.1:5173,http://localhost:5173').split(',');
const hardcoreEnabled=process.env.ALLOW_HARDCORE_EXECUTIONS==='true';
function rejectConnection(socket:WebSocket,message:string,code:number):void{
  if(socket.readyState!==WebSocket.OPEN)return;
  socket.send(JSON.stringify({v:2,type:'error',message,code,fatal:true,retryable:code===4010}));
  socket.close(code,code===4010?'Recuperando servidor':'No autorizado');
  // A proxy may not complete the close handshake; rejected peers retain no world access.
  const cleanup=setTimeout(()=>socket.terminate(),5000);cleanup.unref();socket.once('close',()=>clearTimeout(cleanup));
}
interface Peer {socket:WebSocket;id:string;userId:string;expires:number;window:number;messages:number;queue:{input:ReturnType<typeof parseInput>;at:number}[]}
class Runtime {
  peers=new Map<string,Peer>();revision=0;epoch=0;engine!:WorldEngine;seq=0;
  private working=false;private lastTick=Date.now();private lastSave=0;private lastLease=0;private lastSnapshot=0;private lastAuth=0;
  private timer?:ReturnType<typeof setInterval>;private idleSince=Date.now();private pending?:{id:string;state:SavedWorld;audit:unknown[]};
  private committed?:SavedWorld;private unavailable=false;private stopping=false;private lastRetry=0;
  constructor(readonly campaign:Campaign){}
  async initialize():Promise<void>{
    const {data,error}=await db.rpc('acquire_game_lease',{p_campaign:this.campaign.id,p_instance:instance});if(error)throw error;
    this.epoch=data.epoch;this.revision=data.revision;
    const {data:members,error:memberError}=await db.from('campaign_members').select('user_id,consent_version').eq('campaign_id',this.campaign.id);if(memberError)throw memberError;
    if(this.campaign.mode==='hardcore'&&members?.some(m=>m.consent_version!==RULES_VERSION))throw new Error('Consentimiento hardcore incompleto');
    this.engine=new WorldEngine(this.campaign,data.state?.version?data.state:undefined,hardcoreEnabled,new Set(members?.filter(m=>m.consent_version===RULES_VERSION).map(m=>m.user_id)));
    this.committed=this.engine.export();this.lastLease=Date.now();this.timer=setInterval(()=>this.simulate(),50);
  }
  async connect(socket:WebSocket,character:Character,expires:number):Promise<void>{
    this.idleSince=0;
    const deadline=Date.now()+10000;
    while(this.working){if(Date.now()>deadline||socket.readyState!==WebSocket.OPEN)throw new Error('Campaña recuperándose; vuelve a conectar');await new Promise(resolve=>setTimeout(resolve,25));}
    this.peers.get(character.id)?.socket.close(4001,'Sesión reemplazada');
    this.engine.add(character);this.idleSince=0;this.peers.set(character.id,{socket,id:character.id,userId:character.user_id,expires,window:Date.now(),messages:0,queue:[]});
    socket.send(JSON.stringify({v:2,type:'ready',campaignId:this.campaign.id,epoch:this.epoch}));
  }
  receive(socket:WebSocket,id:string,raw:Buffer):void{
    const p=this.peers.get(id);if(!p||p.socket!==socket)return;
    const now=Date.now();if(now>=p.expires){socket.close(4009,'Sesión caducada');return;}
    if(now-p.window>1000){p.window=now;p.messages=0;}if(++p.messages>35||raw.byteLength>2048){socket.close(4008,'Demasiados mensajes');return;}
    let input;try{input=parseInput(JSON.parse(raw.toString()),this.campaign.id);}catch{return;}
    if(input&&p.queue.length<40)p.queue.push({input,at:now});
  }
  disconnect(socket:WebSocket,id:string):void{const p=this.peers.get(id);if(p?.socket===socket){this.peers.delete(id);this.engine.disconnect(id);if(!this.peers.size)this.idleSince=Date.now();}}
  private async save():Promise<void>{
    this.pending??={id:`${instance}:${this.epoch}:${this.revision+1}`,state:this.engine.export(),audit:structuredClone(this.engine.audit)};
    const pending=this.pending;
    const {data,error}=await db.rpc('commit_game_state',{p_campaign:this.campaign.id,p_instance:instance,p_epoch:this.epoch,p_expected:this.revision,p_event:pending.id,p_state:pending.state,p_audit:pending.audit});
    if(error)throw error;this.revision=data;this.committed=pending.state;this.pending=undefined;this.engine.critical=false;this.engine.audit=[];this.lastSave=Date.now();this.unavailable=false;
  }
  private simulate():void{
    if(this.stopping)return;const now=Date.now(),frozen=!!this.pending||this.unavailable||now-this.lastLease>18000;
    for(const p of this.peers.values())for(const queued of p.queue.splice(0))if(queued.input&&now-queued.at<1000)this.engine.input(p.id,queued.input,now,!frozen);
    if(frozen)this.engine.stepMotion(now,now-this.lastTick);else this.engine.step(now,now-this.lastTick);this.lastTick=now;
    if(!this.unavailable&&now-this.lastSnapshot>=100){this.lastSnapshot=now;this.seq++;
      for(const peer of this.peers.values())if(peer.socket.readyState===WebSocket.OPEN&&this.committed?.players[peer.id]){
        if(peer.socket.bufferedAmount>1000000){peer.socket.close(4008,'Conexión lenta');continue;}
        const state=this.engine.snapshot(peer.id,this.seq,this.epoch),saved=this.committed;
        state.character=saved.players[peer.id].character;state.cases=saved.cases.filter(c=>c.characterId===peer.id||peer.userId===this.campaign.owner_id&&c.capital);
        state.realms=saved.realms;state.events=saved.events;state.forge=saved.forge;state.reputation=saved.players[peer.id].reputation??{};state.permitUntil=saved.players[peer.id].permitUntil;
        state.actors=state.actors.flatMap(actor=>{const old=saved.players[actor.id]?.actor??saved.npcs.find(a=>a.id===actor.id)??saved.enemies.find(a=>a.id===actor.id);if(!old)return [];
          return [{...actor,hp:old.hp,maxHp:old.maxHp,mana:old.mana,state:old.state,...actor.state!==old.state?{x:old.x,y:old.y}:{}}];});
        state.notice=saved.players[peer.id].notice;peer.socket.send(JSON.stringify(state));
      }
    }
    if(!this.working&&(!this.unavailable||now-this.lastRetry>1000))void this.maintain(now);
  }
  private async maintain(now:number):Promise<void>{
    this.working=true;this.lastRetry=now;
    try{
      if(now-this.lastLease>5000){const {data,error}=await db.rpc('acquire_game_lease',{p_campaign:this.campaign.id,p_instance:instance});if(error||data.epoch!==this.epoch)throw error??new Error('Autoridad caducada');this.lastLease=now;}
      if(now-this.lastAuth>3000){const {data,error}=await db.from('campaign_members').select('user_id,consent_version').eq('campaign_id',this.campaign.id);if(error)throw error;
        const members=new Set(data.map(m=>m.user_id));
        this.engine.updateMembers(members,new Set(data.filter(m=>m.consent_version===RULES_VERSION).map(m=>m.user_id)));
        for(const peer of this.peers.values())if(!members.has(peer.userId))peer.socket.close(4003,'Acceso revocado');else if(now>=peer.expires)peer.socket.close(4009,'Sesión caducada');this.lastAuth=now;}
      if(this.pending||this.engine.critical||now-this.lastSave>=2000)await this.save();
      if(this.peers.size===0&&this.idleSince&&now-this.idleSince>15000)await this.stop();
    }catch(error){
      // No speculative rewards/sentences are published. Retry the same commit ID.
      this.unavailable=true;for(const p of this.peers.values())if(p.socket.readyState===WebSocket.OPEN)p.socket.send(JSON.stringify({v:2,type:'error',message:'Guardado no disponible. La partida espera recuperar PostgreSQL.'}));
      this.lastTick=now;
      if(/Autoridad|Revisión|authority|lease/i.test(String((error as {message?:string})?.message))){for(const p of this.peers.values())p.socket.close(4010,'Recuperando autoridad');clearInterval(this.timer);runtimes.delete(this.campaign.id);}
    }finally{this.working=false;}
  }
  async stop():Promise<void>{this.stopping=true;clearInterval(this.timer);if(this.engine.critical||this.pending)await this.save();await db.rpc('release_game_lease',{p_campaign:this.campaign.id,p_instance:instance,p_epoch:this.epoch});runtimes.delete(this.campaign.id);}
}
const initializing=new Map<string,Promise<Runtime>>();
async function runtime(campaign:Campaign):Promise<Runtime>{const existing=runtimes.get(campaign.id);if(existing)return existing;let creating=initializing.get(campaign.id);if(!creating){creating=(async()=>{const r=new Runtime(campaign);await r.initialize();runtimes.set(campaign.id,r);return r;})();initializing.set(campaign.id,creating);}try{return await creating;}finally{initializing.delete(campaign.id);}}
const http=createServer((req,res)=>{if(req.url==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,version:'0.2.0',protocol:PROTOCOL_VERSION,rules:RULES_VERSION,commit:process.env.RENDER_GIT_COMMIT?.slice(0,12),campaigns:runtimes.size}));}else{res.writeHead(404);res.end();}});
const wss=new WebSocketServer({noServer:true,maxPayload:4096});
http.on('upgrade',(req,socket,head)=>{if(req.url!=='/game'||req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
wss.on('connection',socket=>{
  let r:Runtime|undefined,id:string|undefined,authenticating=false;
  const timeout=setTimeout(()=>rejectConnection(socket,'Autenticación requerida',4003),10000);
  socket.on('message',async raw=>{
    if(r&&id){r.receive(socket,id,raw as Buffer);return;}
    if(authenticating)return;authenticating=true;
    try{
      const hello=JSON.parse(raw.toString());if(hello.v!==2||hello.type!=='auth'||typeof hello.token!=='string'||typeof hello.campaignId!=='string')throw new Error('Autenticación inválida');
      const {data:identity,error:identityError}=await db.auth.getUser(hello.token);if(identityError){if((identityError.status??0)>=500||identityError.name==='AuthRetryableFetchError')throw new Error('Autenticación no disponible; recuperando servidor');throw new Error('Sesión inválida');}if(!identity.user)throw new Error('Sesión inválida');
      const {data:member,error:memberError}=await db.from('campaign_members').select('consent_version').eq('campaign_id',hello.campaignId).eq('user_id',identity.user.id).maybeSingle();if(memberError)throw memberError;if(!member)throw new Error('Campaña no autorizada');
      const {data:campaign,error:campaignError}=await db.from('campaigns').select('*').eq('id',hello.campaignId).single();if(campaignError)throw campaignError;
      const {data:character,error:characterError}=await db.from('characters').select('*').eq('campaign_id',campaign.id).eq('user_id',identity.user.id).eq('life_status','active').maybeSingle();if(characterError)throw characterError;if(!character)throw new Error('Crea o vincula un personaje para esta campaña');
      const payload=JSON.parse(Buffer.from(hello.token.split('.')[1],'base64url').toString()); // signature already verified by getUser
      r=await runtime(campaign as Campaign);id=character.id;await r.connect(socket,character as Character,payload.exp*1000);clearTimeout(timeout);
    }catch(error){clearTimeout(timeout);const message=(error as {message?:string}).message??'No se pudo entrar';
      const retryable=/recuper|Autoridad|Revisión|fetch|503|unavailable|paused|timeout|schema cache|database|connection/i.test(message);rejectConnection(socket,message,retryable?4010:4003);}
  });
  socket.on('close',()=>{clearTimeout(timeout);if(r&&id)r.disconnect(socket,id);});
  socket.on('error',()=>socket.close());
});
http.listen(Number(process.env.PORT??3001),'0.0.0.0',()=>process.stdout.write('Authoritative game server ready\n'));
let stopping=false;async function shutdown(){if(stopping)return;stopping=true;for(const r of runtimes.values()){for(const p of r.peers.values())p.socket.close(1012,'Reiniciando servidor');try{await r.stop();}catch{/* persisted commits remain recoverable */}}http.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
