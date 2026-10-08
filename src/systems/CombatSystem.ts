import Phaser from 'phaser';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { statsFor,WORLD } from '../data/definitions';
import type { Character, Direction, Interaction, WorldSnapshot } from '../data/types';
import { awardXp } from './ProgressionSystem';
import { emit, uiState } from '../ui/events';
export const vectors: Record<Direction,{x:number;y:number}> = { down:{x:0,y:1},up:{x:0,y:-1},left:{x:-1,y:0},right:{x:1,y:0} };
interface Bolt { sprite:Phaser.Physics.Arcade.Image; expires:number; damage:number; cosmetic:boolean }
export class CombatSystem {
  health:number; mana:number;
  readonly enemies: Enemy[]=[];
  private bolts:Bolt[]=[];
  private lastSword=-1000;
  private lastMagic=-1000;
  private lastDodge=-2000;
  private invulnerable=0;
  constructor(private scene:Phaser.Scene,readonly player:Player,readonly character:Character,private local:boolean,private obstacles:Phaser.Physics.Arcade.StaticGroup) {
    const stats=statsFor(character);this.health=stats.health;this.mana=stats.mana;
    if(local)this.spawnEnemies();
  }
  private spawnEnemies():void {
    [[750,1520],[890,1500],[1260,1400],[1370,1630]].forEach(([x,y],index)=>{
      const enemy=new Enemy(this.scene,x,y,`slime-${index}`);this.enemies.push(enemy);this.scene.physics.add.collider(enemy.sprite,this.obstacles);
    });
  }
  attack(action:'sword'|'magic'|'dodge',time:number):boolean {
    if(!this.local||this.player.dead||time<this.player.lockedUntil||uiState.modal)return false;
    if(action==='dodge'){
      if(time-this.lastDodge<1500)return false;
      this.lastDodge=time;this.invulnerable=time+350;this.player.lockedUntil=time+220;
      const v=vectors[this.player.direction];this.player.sprite.setVelocity(v.x*420,v.y*420);this.player.sprite.setAlpha(0.55);
      this.scene.time.delayedCall(240,()=>this.player.sprite.setAlpha(1));
      this.particles(this.player.sprite.x,this.player.sprite.y,0xe0d7a0);return true;
    }
    const magic=action==='magic';
    if(time-(magic?this.lastMagic:this.lastSword)<(magic?650:450)||magic&&this.mana<12)return false;
    if(magic){this.lastMagic=time;this.mana-=12;}else this.lastSword=time;
    this.player.animate('attack',350);
    this.effect({action,x:this.player.sprite.x,y:this.player.sprite.y,direction:this.player.direction,seq:0},false);
    if(!magic&&this.local){
      const stats=statsFor(this.character),v=vectors[this.player.direction];
      for(const enemy of [...this.enemies]){
        const dx=enemy.sprite.x-this.player.sprite.x,dy=enemy.sprite.y-this.player.sprite.y,d=Math.hypot(dx,dy);
        if(d<85&&(dx*v.x+dy*v.y)/(d||1)>0.15)this.damageEnemy(enemy,stats.physical+(this.character.skills.includes('hybrid')?stats.magical/2:0));
      }
    }
    return true;
  }
  effect(action:Interaction,cosmetic=true,damage=statsFor(this.character).magical):void {
    const v=vectors[action.direction];
    if(action.action==='magic'){
      const sprite=this.scene.physics.add.image(action.x+v.x*30,action.y+v.y*30,'auralita').setScale(0.55).setTint(0xbce9dc).setDepth(action.y+100);
      sprite.body!.setSize(12,12);sprite.setVelocity(v.x*340,v.y*340);
      this.bolts.push({sprite,expires:this.scene.time.now+1400,damage,cosmetic:cosmetic||!this.local});
    }else if(action.action==='sword'){
      const arc=this.scene.add.graphics().setDepth(action.y+60),angle=Math.atan2(v.y,v.x);
      arc.lineStyle(3,0xe8dab0,0.9);arc.beginPath();arc.arc(action.x,action.y,45,angle-0.9,angle+0.9);arc.strokePath();
      this.scene.tweens.add({targets:arc,alpha:0,duration:220,onComplete:()=>arc.destroy()});
    }else this.particles(action.x,action.y,action.action==='mine'?0xbbe0c4:0xdcd4ac);
  }
  snapshot():WorldSnapshot['enemies']{return this.enemies.map(e=>({id:e.id,x:e.sprite.x,y:e.sprite.y,health:e.health}));}
  private damageEnemy(enemy:Enemy,damage:number):void {
    enemy.health-=Math.round(damage);enemy.sprite.setTint(0xede8c9);this.scene.time.delayedCall(90,()=>{if(enemy.sprite.active)enemy.sprite.clearTint();});
    this.floating(enemy.sprite.x,enemy.sprite.y-20,`−${Math.round(damage)}`,'#f3d59b');
    if(enemy.health<=0){
      this.particles(enemy.sprite.x,enemy.sprite.y,0xa7c895);const spawn=enemy.spawn;
      this.enemies.splice(this.enemies.indexOf(enemy),1);enemy.sprite.destroy();
      if(this.local){const levels=awardXp(this.character,45);this.character.coins+=8;
        if(levels){const stats=statsFor(this.character);this.health=stats.health;this.mana=stats.mana;this.particles(this.player.sprite.x,this.player.sprite.y,0xffe0a0);emit('toast',`¡Nivel ${this.character.level}! ${this.character.level===3?'Hoja encantada desbloqueada.':''}`);}
        emit('save',undefined);
      }
      this.scene.time.delayedCall(15000,()=>{if(this.local){const revived=new Enemy(this.scene,spawn.x,spawn.y,enemy.id);this.enemies.push(revived);this.scene.physics.add.collider(revived.sprite,this.obstacles);}});
    }
  }
  update(time:number,delta:number):void {
    this.mana=Math.min(statsFor(this.character).mana,this.mana+delta*0.007);
    if(this.local&&!uiState.modal)for(const enemy of this.enemies){
      enemy.update(this.player.sprite.x,this.player.sprite.y);
      if(!this.player.dead&&Math.hypot(enemy.sprite.x-this.player.sprite.x,enemy.sprite.y-this.player.sprite.y)<37&&time-enemy.lastAttack>1000&&time>this.invulnerable){
        enemy.lastAttack=time;this.health=Math.max(0,this.health-12);this.invulnerable=time+450;
        this.player.animate('hurt',300);this.floating(this.player.sprite.x,this.player.sprite.y-22,'−12','#e89b7c');
        if(this.health===0){
          this.player.dead=true;this.player.sprite.setVelocity(0,0);this.player.animate('death',1200);emit('toast','Has caído. Valdoria te llama de vuelta…');
          this.scene.time.delayedCall(2000,()=>{this.player.sprite.setPosition(WORLD.spawn.x,WORLD.spawn.y);this.player.dead=false;this.health=statsFor(this.character).health;this.mana=statsFor(this.character).mana;this.player.animate('idle');});
        }
      }
    }
    if(uiState.modal&&this.local)for(const enemy of this.enemies)enemy.sprite.setVelocity(0,0);
    for(const bolt of [...this.bolts]){
      if(!bolt.cosmetic)for(const enemy of [...this.enemies])if(Math.hypot(bolt.sprite.x-enemy.sprite.x,bolt.sprite.y-enemy.sprite.y)<26){this.damageEnemy(enemy,bolt.damage);bolt.expires=0;break;}
      if(time>bolt.expires){bolt.sprite.destroy();this.bolts.splice(this.bolts.indexOf(bolt),1);}
    }
  }
  drinkPotion():boolean {
    if(!this.local||this.player.dead||this.health>=statsFor(this.character).health||(this.character.inventory.pocion??0)<1)return false;
    this.character.inventory.pocion--;this.health=Math.min(statsFor(this.character).health,this.health+45);emit('save',undefined);return true;
  }
  particles(x:number,y:number,color:number):void {
    for(let i=0;i<10;i++){const p=this.scene.add.rectangle(x,y,3,3,color).setDepth(y+100);
      this.scene.tweens.add({targets:p,x:x+Phaser.Math.Between(-35,35),y:y+Phaser.Math.Between(-40,10),alpha:0,duration:500,onComplete:()=>p.destroy()});}
  }
  private floating(x:number,y:number,text:string,color:string):void {
    if(!uiState.damageNumbers)return;
    const label=this.scene.add.text(x,y,text,{fontFamily:'system-ui',fontSize:14,color,stroke:'#20312a',strokeThickness:3}).setOrigin(0.5).setDepth(y+150);
    this.scene.tweens.add({targets:label,y:y-28,alpha:0,duration:700,onComplete:()=>label.destroy()});
  }
}
