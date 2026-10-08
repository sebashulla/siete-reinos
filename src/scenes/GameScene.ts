import Phaser from 'phaser';
import {Player} from '../entities/Player';
import {Enemy} from '../entities/Enemy';
import {WORLD,statsFor} from '../data/definitions';
import type {Character,Position} from '../data/types';
import {playActor} from '../art/sprites';
import {WorldView} from '../world/WorldView';
import {CombatSystem} from '../systems/CombatSystem';
import {ResourceSystem} from '../systems/ResourceSystem';
import {InventorySystem} from '../systems/InventorySystem';
import {awardXp} from '../systems/ProgressionSystem';
import {emit,uiState} from '../ui/events';
import type {MultiplayerService} from '../services/MultiplayerService';
import {moveColliding,territoryAt} from '../shared/world';
import type {Action,Actor,Snapshot} from '../shared/protocol';
import {interpolate} from '../net/protocol';
import {caravanTexture} from '../art/caravan';
export interface GameSession {character:Character;online:boolean;multiplayer?:MultiplayerService}
export interface Hud {health:number;mana:number;maxHealth:number;maxMana:number;x:number;y:number;area:string;hint:string;mining:number;dodge:number}
export class GameScene extends Phaser.Scene {
 player!:Player;combat!:CombatSystem;
 private session!:GameSession;private world!:WorldView;private resources=new ResourceSystem();private inventory!:InventorySystem;
 private actors=new Map<string,Player>();private enemies=new Map<string,Enemy>();private received?:Snapshot;private own?:Actor;
 private keys!:Record<string,Phaser.Input.Keyboard.Key>;private lastHud=0;private lastDodge=-1500;private lastStateSeq=-1;private epoch=-1;
 private devInput?:{direction:Position['direction'];until:number};
 private effects=new Map<string,number>();private enemyTargets=new Map<string,{x:number;y:number}>();
 constructor(){super('GameScene');}
 init(data:GameSession):void{this.session=data;this.resources=new ResourceSystem();this.actors.clear();this.enemies.clear();this.effects.clear();this.enemyTargets.clear();this.own=undefined;this.received=undefined;this.lastDodge=-1500;this.lastStateSeq=-1;this.epoch=-1;this.devInput=undefined;}
 create():void{
  caravanTexture(this);
  this.world=new WorldView(this,!this.session.online);if(!this.session.online&&Number(localStorage.getItem('siete-reinos:forge'))>=10)this.world.lightForge();
  this.player=new Player(this,this.session.character,WORLD.spawn.x,WORLD.spawn.y);
  if(!this.session.online)this.physics.add.collider(this.player.sprite,this.world.obstacles);
  this.combat=new CombatSystem(this,this.player,this.session.character,!this.session.online,this.world.obstacles);this.inventory=new InventorySystem(this.session.character);
  this.cameras.main.setBounds(0,0,WORLD.width,WORLD.height).setZoom(Number(localStorage.getItem('siete-reinos:zoom'))||.85).startFollow(this.player.sprite,true,.12,.12);
  this.keys=this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,Q,SHIFT,E,I,K,M,L,F,ESC') as typeof this.keys;
  this.input.keyboard!.addCapture(['SPACE','UP','DOWN','LEFT','RIGHT']);
  const shortcut=(key:string,event:string)=>this.input.keyboard!.on(`keydown-${key}`,()=>{if(!uiState.modal)emit(event,undefined);});
  shortcut('I','inventory');shortcut('K','skills');shortcut('M','minimap');shortcut('L','laws');shortcut('F','fullscreen');shortcut('ESC','pause');
  for(const[key,action]of [['SPACE','sword'],['Q','magic'],['SHIFT','dodge']] as const)this.input.keyboard!.on(`keydown-${key}`,(event:KeyboardEvent)=>{if(!event.repeat)this.action(action);});
  this.input.keyboard!.on('keydown-E',(event:KeyboardEvent)=>{if(!event.repeat&&!uiState.modal&&!this.player.dead)this.interact();});
  this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>{if(p.leftButtonDown())this.action('sword');});
  this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.input.keyboard?.removeAllListeners();this.actors.clear();this.enemies.clear();});
 }
 action(action:'sword'|'magic'|'dodge'):void{
  if(uiState.modal||this.player.dead)return;
  if(this.session.online){this.session.multiplayer?.sendAction(action,this.player.direction);return;}
  if(this.combat.attack(action,this.time.now)&&action==='dodge')this.lastDodge=this.time.now;
 }
 command(action:Action,target?:string):void{this.session.multiplayer?.sendAction(action,this.player.direction,target);}
 update(time:number,delta:number):void{
  if(!this.player)return;const sprite=this.player.sprite,ready=!this.session.online||this.session.multiplayer?.isReady;
  const dev=import.meta.env.DEV&&this.devInput&&time<this.devInput.until?this.devInput.direction:null;
  const enabled=ready&&!uiState.modal&&!this.player.dead&&(!this.own||this.own.state==='alive');
  const dx=enabled?(dev?(dev==='right'?1:dev==='left'?-1:0):(this.keys.D.isDown||this.keys.RIGHT.isDown?1:0)-(this.keys.A.isDown||this.keys.LEFT.isDown?1:0)):0;
  const dy=enabled?(dev?(dev==='down'?1:dev==='up'?-1:0):(this.keys.S.isDown||this.keys.DOWN.isDown?1:0)-(this.keys.W.isDown||this.keys.UP.isDown?1:0)):0;
  if(dx)this.player.direction=dx>0?'right':'left';else if(dy)this.player.direction=dy>0?'down':'up';
  const speed=statsFor(this.session.character).speed,len=Math.hypot(dx,dy)||1;
  if(this.session.online){sprite.setVelocity(0,0);const next=moveColliding(sprite.x,sprite.y,dx/len*speed*Math.min(delta,100)/1000,dy/len*speed*Math.min(delta,100)/1000);sprite.setPosition(next.x,next.y);this.session.multiplayer?.sendMove(dx,dy,this.player.direction);}
  else if(time>=this.player.lockedUntil)sprite.setVelocity(dx/len*speed,dy/len*speed);
  if(time>=this.player.lockedUntil&&!this.player.dead)playActor(sprite,dx||dy?'walk':'idle',this.player.direction);
  this.world.update(sprite.x,sprite.y);this.player.updateVisual(delta);for(const actor of this.actors.values())actor.updateVisual(delta,true);
  for(const [id,enemy] of this.enemies){const target=this.enemyTargets.get(id);if(target)enemy.sprite.setPosition(interpolate(enemy.sprite.x,target.x,delta),interpolate(enemy.sprite.y,target.y,delta)).setDepth(enemy.sprite.y);enemy.updateBar();}
  this.combat.update(time,delta);
  if(uiState.modal&&this.resources.mining)this.resources.mining.started+=delta;
  const mining=this.session.online?null:uiState.modal?null:this.resources.update(time,sprite.x,sprite.y);
  if(mining?.complete){this.inventory.add(mining.object.kind,1);awardXp(this.session.character,12);emit('save',undefined);emit('toast',`+1 ${mining.object.kind}`);this.combat.particles(mining.object.x,mining.object.y,0xbdd8bd);}
  if(time-this.lastHud>100){this.lastHud=time;const stats=statsFor(this.session.character),near=this.world.nearest(sprite.x,sprite.y);
   this.player.setHealth(this.own?.hp??this.combat.health,this.own?.maxHp??stats.health);
   emit<Hud>('hud',{health:this.own?.hp??this.combat.health,mana:this.own?.mana??this.combat.mana,maxHealth:this.own?.maxHp??stats.health,maxMana:stats.mana,x:sprite.x,y:sprite.y,area:territoryAt(sprite.x,sprite.y).name,hint:near?`E · ${near.label}`:'',mining:this.received?.mining??mining?.progress??0,dodge:Math.min(1,(time-this.lastDodge)/1500)});
   if(import.meta.env.DEV){emit('qa-world',this.session.online?this.received?.actors.filter(a=>a.kind==='enemy').map(a=>({id:a.id,health:a.hp}))??[]:this.combat.snapshot());emit('qa-motion',Boolean(this.devInput&&time<this.devInput.until));}
  }
 }
 private interact():void{
  const rescue=this.received?.actors.find(a=>a.kind==='player'&&a.id!==this.session.character.id&&a.state==='downed'&&Math.hypot(a.x-this.player.sprite.x,a.y-this.player.sprite.y)<82);if(rescue){this.command('rescue',rescue.id);return;}
  const obj=this.world.nearest(this.player.sprite.x,this.player.sprite.y);if(!obj)return;
  if(this.session.online){
   if(obj.kind==='feron'||obj.kind==='auralita')this.command('interact',obj.id);
   else if(obj.kind==='permit')this.command('permit',obj.id);
   else if(obj.kind==='work')this.command('work',obj.id);
   else if(obj.kind==='judge'||obj.kind==='guard')emit('laws',undefined);
   else if(obj.kind==='chest')emit('chest',obj.id);
   else emit(obj.kind==='merchant'?'merchant':'forge',obj.id);
  }else if(obj.kind==='feron'||obj.kind==='auralita'){if(!this.resources.begin(obj,this.time.now))emit('toast','La veta se está recuperando.');}
  else if(obj.kind==='merchant'||obj.kind==='forge')emit(obj.kind,undefined);else emit('toast','Gobiernos y justicia están disponibles en campañas conectadas.');
 }
 applyState(state:Snapshot):void{
  if(state.epoch===this.epoch&&state.seq<=this.lastStateSeq)return;this.epoch=state.epoch;this.lastStateSeq=state.seq;this.received=state;
  Object.assign(this.session.character,state.character);const own=state.actors.find(a=>a.id===this.session.character.id);if(!own)return;
  this.own=own;this.player.dead=own.state==='downed'||own.state==='executed';const d=Math.hypot(this.player.sprite.x-own.x,this.player.sprite.y-own.y);
  if(d>50||own.state!=='alive')this.player.sprite.setPosition(own.x,own.y);else if(d>3)this.player.sprite.setPosition(Phaser.Math.Linear(this.player.sprite.x,own.x,.4),Phaser.Math.Linear(this.player.sprite.y,own.y,.4));
  if(['attack','hurt','death'].includes(own.animation))this.player.animate(own.animation,300);
  for(const actor of state.actors)if(actor.effect&&this.effects.get(actor.id)!==actor.effect.seq){
   const seen=this.effects.has(actor.id);this.effects.set(actor.id,actor.effect.seq);
   if(seen||actor.id===own.id){this.combat.effect({action:actor.effect.action,x:actor.x,y:actor.y,direction:actor.direction,seq:actor.effect.seq},true);if(actor.id===own.id&&actor.effect.action==='dodge')this.lastDodge=this.time.now;}
  }
  const active=new Set(state.actors.map(a=>a.id));
  for(const[id,actor]of this.actors)if(!active.has(id)){actor.destroy();this.actors.delete(id);}
  for(const[id,enemy]of this.enemies)if(!active.has(id)){enemy.destroy();this.enemies.delete(id);}
  for(const actor of state.actors){if(actor.id===own.id)continue;
   if(actor.kind==='enemy'){let enemy=this.enemies.get(actor.id);if(!enemy){enemy=new Enemy(this,actor.x,actor.y,actor.id);this.enemies.set(actor.id,enemy);}this.enemyTargets.set(actor.id,{x:actor.x,y:actor.y});enemy.sprite.setAlpha(actor.hp>0?1:.25);enemy.health=actor.hp;enemy.updateBar();}
   else{let visual=this.actors.get(actor.id);if(!visual){visual=new Player(this,{user_id:actor.userId??actor.id,character_id:actor.id,name:actor.name,affinity:actor.affinity,appearance:actor.appearance},actor.x,actor.y,false);this.actors.set(actor.id,visual);if(actor.kind==='caravan'){visual.sprite.anims.stop();visual.sprite.setTexture('caravan');}}visual.setTarget({x:actor.x,y:actor.y,direction:actor.direction,moving:actor.moving,seq:state.seq});visual.setHealth(actor.hp,actor.maxHp);if(['attack','hurt','death'].includes(actor.animation))visual.animate(actor.animation,200);}
  }
  if(state.forge>=10)this.world.lightForge();emit('server-state',state);
 }
 rebuildForge():void{this.world.lightForge();}
 setZoom(zoom:number):void{this.cameras.main.setZoom(zoom);localStorage.setItem('siete-reinos:zoom',String(zoom));}
 devWalk(direction:Position['direction']):void{if(import.meta.env.DEV)this.devInput={direction,until:this.time.now+1000};}
}

