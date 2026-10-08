import Phaser from 'phaser';
import type { ActorAction, Character, Direction, Member, Position } from '../data/types';
import { playActor, spriteKey } from '../art/sprites';
import { interpolate } from '../net/protocol';
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly nameLabel: Phaser.GameObjects.Text;
  private shadow: Phaser.GameObjects.Ellipse;
  direction: Direction = 'down';
  lockedUntil = 0;
  dead = false;
  private target?: Position;
  constructor(scene: Phaser.Scene, data: Character | Member, x:number, y:number, local=true) {
    this.shadow=scene.add.ellipse(x,y+17,26,9,0x142921,0.38);
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
  updateVisual(delta:number,remote=false): void {
    if(remote&&this.target){
      this.sprite.setPosition(interpolate(this.sprite.x,this.target.x,delta),interpolate(this.sprite.y,this.target.y,delta));
      this.direction=this.target.direction;
      if(this.sprite.scene.time.now>this.lockedUntil)playActor(this.sprite,this.target.moving?'walk':'idle',this.direction);
    }
    this.sprite.setDepth(this.sprite.y);this.shadow.setPosition(this.sprite.x,this.sprite.y+17).setDepth(this.sprite.y-1);
    this.nameLabel.setPosition(this.sprite.x,this.sprite.y-33).setDepth(this.sprite.y+50);
  }
  destroy(): void { this.sprite.destroy();this.shadow.destroy();this.nameLabel.destroy(); }
}
