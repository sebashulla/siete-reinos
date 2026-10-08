import {requireSupabase} from './supabase';
import type {Campaign,Direction} from '../data/types';
import type {Action,Snapshot} from '../shared/protocol';
export interface GameCallbacks {world:(state:Snapshot)=>void;status:(status:string)=>void;lostAccess:(message:string)=>void}
export class MultiplayerService {
 private socket?:WebSocket;private callbacks?:GameCallbacks;private campaign?:Campaign;
 private generation=0;private sequence=0;private lastMove=0;private retry=0;private reconnectTimer?:ReturnType<typeof setTimeout>;
 private ready=false;get isReady(){return this.ready;}
 async connect(campaign:Campaign,callbacks:GameCallbacks):Promise<void>{
  await this.disconnect();this.campaign=campaign;this.callbacks=callbacks;this.sequence=0;this.retry=0;
  const endpoint=import.meta.env.VITE_GAME_SERVER_URL?.trim();if(!endpoint)throw new Error('Falta configurar el servidor de juego. La aventura conectada no se simula localmente.');
  const generation=this.generation;
  await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('El servidor tarda en arrancar. Vuelve a intentarlo.')),120000);
   void this.open(generation,()=>{clearTimeout(timeout);resolve();},error=>{clearTimeout(timeout);reject(error);});});
 }
 private async open(generation:number,onReady?:()=>void,onError?:(e:Error)=>void):Promise<void>{
  if(generation!==this.generation||!this.campaign)return;
  this.callbacks?.status(this.retry?'Reconectando':'Despertando servidor');
  const {data,error}=await requireSupabase().auth.getSession();if(error||!data.session){onError?.(new Error('Inicia sesión de nuevo'));this.callbacks?.lostAccess('Tu sesión caducó.');return;}
  if(generation!==this.generation)return;
  const url=new URL(import.meta.env.VITE_GAME_SERVER_URL);url.protocol=url.protocol==='https:'||url.protocol==='wss:'?'wss:':'ws:';url.pathname='/game';url.search='';
  const socket=new WebSocket(url);this.socket=socket;
  socket.onopen=()=>socket.send(JSON.stringify({v:2,type:'auth',token:data.session!.access_token,campaignId:this.campaign!.id}));
  socket.onmessage=event=>{
   if(generation!==this.generation||socket!==this.socket)return;
   let message;try{message=JSON.parse(event.data);}catch{return;}if(message.v!==2)return;
   if(message.type==='ready'){this.ready=true;this.retry=0;this.callbacks?.status('En línea');onReady?.();}
   if(message.type==='state'&&message.campaignId===this.campaign?.id){if(!this.ready)this.callbacks?.status('En línea');this.ready=true;this.callbacks?.world(message as Snapshot);}
   if(message.type==='error'){this.ready=false;this.callbacks?.status(message.message);}
  };
  socket.onclose=event=>{
   if(generation!==this.generation||socket!==this.socket)return;this.ready=false;
   if(event.code===4003||event.code===4001){onError?.(new Error(event.reason));this.callbacks?.lostAccess(event.reason||'Acceso no autorizado');return;}
   this.callbacks?.status('Reconectando');const delay=Math.min(1000*2**this.retry++,10000);
   this.reconnectTimer=setTimeout(()=>void this.open(generation,onReady,onError),delay);
  };
  socket.onerror=()=>this.callbacks?.status('Servidor no disponible · reintentando');
 }
 sendMove(dx:number,dy:number,direction:Direction):void{if(performance.now()-this.lastMove<50)return;this.lastMove=performance.now();this.send(dx,dy,direction);}
 sendAction(action:Action,direction:Direction,target?:string):void{this.send(0,0,direction,action,target);}
 private send(dx:number,dy:number,direction:Direction,action?:Action,target?:string):void{
  if(!this.ready||this.socket?.readyState!==WebSocket.OPEN||!this.campaign)return;
  this.socket.send(JSON.stringify({v:2,campaignId:this.campaign.id,seq:++this.sequence,dx,dy,direction,action,target}));
 }
 async disconnect():Promise<void>{this.generation++;this.ready=false;clearTimeout(this.reconnectTimer);this.socket?.close(1000);this.socket=undefined;this.campaign=undefined;}
}
