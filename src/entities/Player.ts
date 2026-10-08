import Phaser from 'phaser';
import type { ActorAction, Character, Direction, Member, Position } from '../data/types';
import { playActor, spriteKey } from '../art/sprites';
import { interpolate } from '../net/protocol';
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly nameLabel: Phaser.GameObjects.Text;
  private shadow: Phaser.GameObjects.Ellipse;
  private healthBar:Phaser.GameObjects.Graphics;
  private health=1;private maxHealth=1;
  direction: Direction = 'down';
  lockedUntil = 0;
  dead = false;
  private target?: Position;
  constructor(scene: Phaser.Scene, data: Character | Member, x:number, y:number, local=true) {
    this.shadow=scene.add.ellipse(x,y+17,26,9,0x142921,0.38);
    this.healthBar=scene.add.graphics();
    this.sprite=scene.physics.add.sprite(x,y,spriteKey(data.affinity,data.appearance)).setScale(1.8).setCollideWorldBounds(true);
    this.sprite.body!.setSize(12,9).setOffset(10,21);
    this.nameLabel=scene.add.text(x,y-33,data.name,{fontFamily:'system-ui',fontSize:'11px',color:local?'#f2dfac':'#b5ded1',stroke:'#1b2e29',strokeThickness:3}).setOrigin(0.5);
    playActor(this.sprite,'idle','down');
  }
  animate(action: ActorAction, duration=0): void {
    playActor(this.sprite,action,this.direction);
    if(duration)this.lockedUntil=this.sprite.scene.time.now+duration;
  }
  setTarget(position: Position): void { this.target=position; }
  setHealth(hp:number,maxHp:number):void{this.health=hp;this.maxHealth=maxHp;}
  updateVisual(delta:number,remote=false): void {
    if(remote&&this.target){
      this.sprite.setPosition(interpolate(this.sprite.x,this.target.x,delta),interpolate(this.sprite.y,this.target.y,delta));
      this.direction=this.target.direction;
      if(this.sprite.texture.key!=='caravan'&&this.sprite.scene.time.now>this.lockedUntil)playActor(this.sprite,this.target.moving?'walk':'idle',this.direction);
    }
    this.sprite.setDepth(this.sprite.y);this.shadow.setPosition(this.sprite.x,this.sprite.y+17).setDepth(this.sprite.y-1);
    this.nameLabel.setPosition(this.sprite.x,this.sprite.y-33).setDepth(this.sprite.y+50);
    this.healthBar.clear().setPosition(this.sprite.x-19,this.sprite.y-25).setDepth(this.sprite.y+51);
    this.healthBar.fillStyle(0x1c2d25,.9).fillRect(0,0,38,5);this.healthBar.fillStyle(this.health/this.maxHealth<.3?0xcc6557:0x92c77f).fillRect(1,1,36*Math.max(0,this.health/this.maxHealth),3);
  }
  destroy(): void { this.sprite.destroy();this.shadow.destroy();this.nameLabel.destroy();this.healthBar.destroy(); }
}
