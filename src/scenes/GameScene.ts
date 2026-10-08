import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { WORLD, statsFor } from '../data/definitions';
import type { Character, Interaction, Member, Position, WorldSnapshot } from '../data/types';
import { playActor } from '../art/sprites';
import { WorldView } from '../world/WorldView';
import { CombatSystem } from '../systems/CombatSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { InventorySystem } from '../systems/InventorySystem';
import { awardXp } from '../systems/ProgressionSystem';
import { emit, uiState } from '../ui/events';
import type { MultiplayerService } from '../services/MultiplayerService';
export interface GameSession { character:Character; online:boolean; multiplayer?:MultiplayerService }
export interface Hud { health:number;mana:number;maxHealth:number;maxMana:number;x:number;y:number;area:string;hint:string;mining:number;dodge:number }
export class GameScene extends Phaser.Scene {
  player!:Player;
  combat!:CombatSystem;
  private session!:GameSession;
  private world!:WorldView;
  private resources=new ResourceSystem();
  private inventory!:InventorySystem;
  private remotes=new Map<string,Player>();
  private members:Member[]=[];
  private keys!:Record<string,Phaser.Input.Keyboard.Key>;
  private lastHud=0;
  private lastDodge=-1500;
  private devInput?: {direction:Position['direction'];until:number};
  constructor(){super('GameScene');}
  init(data:GameSession):void{this.session=data;this.resources=new ResourceSystem();this.remotes.clear();this.lastDodge=-1500;this.devInput=undefined;}
  create():void{
    this.world=new WorldView(this);if(!this.session.online&&Number(localStorage.getItem('siete-reinos:forge'))>=10)this.world.lightForge();
    this.player=new Player(this,this.session.character,WORLD.spawn.x,WORLD.spawn.y);
    this.physics.add.collider(this.player.sprite,this.world.obstacles);
    this.combat=new CombatSystem(this,this.player,this.session.character,!this.session.online,this.world.obstacles);
    this.inventory=new InventorySystem(this.session.character);
    this.cameras.main.setBounds(0,0,WORLD.width,WORLD.height).setZoom(1.1).startFollow(this.player.sprite,true,0.12,0.12);
    this.keys=this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,Q,SHIFT,E,I,K,M,ESC') as typeof this.keys;
    this.input.keyboard!.addCapture(['SPACE','UP','DOWN','LEFT','RIGHT']);
    const shortcut=(key:string,event:string)=>this.input.keyboard!.on(`keydown-${key}`,()=>{if(!uiState.modal)emit(event,undefined);});
    shortcut('I','inventory');shortcut('K','skills');shortcut('M','minimap');shortcut('ESC','pause');
    for(const[key,action]of [['SPACE','sword'],['Q','magic'],['SHIFT','dodge']] as const){
      this.input.keyboard!.on(`keydown-${key}`,(event:KeyboardEvent)=>{if(!event.repeat)this.action(action);});
    }
    this.input.keyboard!.on('keydown-E',(event:KeyboardEvent)=>{if(!event.repeat&&!uiState.modal&&!this.player.dead)this.interact();});
    this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{if(pointer.leftButtonDown())this.action('sword');});
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.input.keyboard?.removeAllListeners();this.remotes.clear();});
  }
  action(action:'sword'|'magic'|'dodge'):void{
    if(this.combat.attack(action,this.time.now)){
      if(action==='dodge')this.lastDodge=this.time.now;
      this.session.multiplayer?.sendInteraction({action,x:this.player.sprite.x,y:this.player.sprite.y,direction:this.player.direction});
    }
  }
  update(time:number,delta:number):void{
    if(!this.player)return;
    const sprite=this.player.sprite;
    if(!uiState.modal&&!this.player.dead&&time>=this.player.lockedUntil){
      const dev=import.meta.env.DEV&&this.devInput&&time<this.devInput.until?this.devInput.direction:null;
      const dx=dev?(dev==='right'?1:dev==='left'?-1:0):(this.keys.D.isDown||this.keys.RIGHT.isDown?1:0)-(this.keys.A.isDown||this.keys.LEFT.isDown?1:0);
      const dy=dev?(dev==='down'?1:dev==='up'?-1:0):(this.keys.S.isDown||this.keys.DOWN.isDown?1:0)-(this.keys.W.isDown||this.keys.UP.isDown?1:0);
      const speed=statsFor(this.session.character).speed,len=Math.hypot(dx,dy)||1;sprite.setVelocity(dx/len*speed,dy/len*speed);
      if(dx)this.player.direction=dx>0?'right':'left';else if(dy)this.player.direction=dy>0?'down':'up';
      playActor(sprite,dx||dy?'walk':'idle',this.player.direction);
    }else if(uiState.modal||this.player.dead)sprite.setVelocity(0,0);
    else if(time-this.lastDodge>240)sprite.setVelocity(0,0);
    this.player.updateVisual(delta);for(const remote of this.remotes.values())remote.updateVisual(delta,true);
    this.combat.update(time,delta);
    if(this.combat.isHost){this.combat.setTargets([...this.remotes.values()].map(r=>({x:r.sprite.x,y:r.sprite.y})));this.session.multiplayer?.sendWorld(this.combat.snapshot());}
    this.session.multiplayer?.sendPosition({x:sprite.x,y:sprite.y,direction:this.player.direction,moving:Math.hypot(sprite.body!.velocity.x,sprite.body!.velocity.y)>0});
    if(uiState.modal&&this.resources.mining)this.resources.mining.started+=delta;
    const mining=uiState.modal?null:this.resources.update(time,sprite.x,sprite.y);
    if(mining?.complete){
      if(!this.session.online){this.inventory.add(mining.object.kind,1);awardXp(this.session.character,12);emit('save',undefined);emit('toast',`+1 ${mining.object.kind==='feron'?'Feron':'Auralita'}`);}
      else emit('toast','Extracción compartida de práctica. No otorga materiales persistentes.');
      this.combat.particles(mining.object.x,mining.object.y,0xbdd8bd);
      this.session.multiplayer?.sendInteraction({action:'mine',x:mining.object.x,y:mining.object.y,direction:this.player.direction});
    }
    if(time-this.lastHud>100){
      this.lastHud=time;const stats=statsFor(this.session.character),near=this.world.nearest(sprite.x,sprite.y);
      const area=sprite.x>1300&&sprite.y<560?'Minas de la Auralita':sprite.x<670&&sprite.y<720?'Bosque de los Susurros':sprite.y>1080&&sprite.x>700?'El Círculo Antiguo':'Pueblo de Valdoria';
      emit<Hud>('hud',{health:this.combat.health,mana:this.combat.mana,maxHealth:stats.health,maxMana:stats.mana,x:sprite.x,y:sprite.y,area,
        hint:near?`E · ${near.label}`:'',mining:mining?.progress??0,dodge:Math.min(1,(time-this.lastDodge)/1500)});
      if(import.meta.env.DEV){emit('qa-world',this.combat.snapshot());emit('qa-motion',Boolean(this.devInput&&time<this.devInput.until));}
    }
  }
  private interact():void{
    const obj=this.world.nearest(this.player.sprite.x,this.player.sprite.y);if(!obj)return;
    if(obj.kind==='feron'||obj.kind==='auralita'){
      if(!this.resources.begin(obj,this.time.now))emit('toast','La veta se está recuperando. Vuelve en unos segundos.');
    }else emit(obj.kind==='merchant'?'merchant':'forge',undefined);
  }
  setMembers(members:Member[],online:Set<string>):void{
    if(!this.player)return;
    this.members=members;
    const active=new Set(members.filter(m=>online.has(m.user_id)&&m.user_id!==this.session.character.user_id).map(m=>m.user_id));
    for(const[id,player]of this.remotes)if(!active.has(id)){player.destroy();this.remotes.delete(id);}
    for(const member of members)if(active.has(member.user_id)&&!this.remotes.has(member.user_id))this.remotes.set(member.user_id,new Player(this,member,WORLD.spawn.x+32,WORLD.spawn.y,false));
  }
  remotePosition(user:string,position:Position):void{this.remotes.get(user)?.setTarget(position);}
  remoteInteraction(user:string,action:Interaction):void{
    const remote=this.remotes.get(user);if(!remote)return;
    remote.direction=action.direction;remote.animate('attack',350);
    const member=this.members.find(m=>m.user_id===user);
    const accepted=member&&this.combat.sharedAttack(user,action,member,{x:remote.sprite.x,y:remote.sprite.y});
    if(!accepted||action.action!=='magic')this.combat.effect(action);
  }
  setHost(userId:string):void{this.combat?.setHost(userId===this.session.character.user_id);}
  applyWorld(snapshot:WorldSnapshot):void{this.combat?.applySnapshot(snapshot);}
  rebuildForge():void{this.world.lightForge();}
  devWalk(direction:Position['direction']):void{
    if(import.meta.env.DEV)this.devInput={direction,until:this.time.now+1000};
  }
}
