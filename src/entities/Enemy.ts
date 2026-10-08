import Phaser from 'phaser';
export class Enemy {
  sprite: Phaser.Physics.Arcade.Sprite;
  health=70;
  lastAttack=0;
  readonly spawn: {x:number;y:number};
  constructor(scene:Phaser.Scene,x:number,y:number,readonly id:string=crypto.randomUUID()) {
    this.spawn={x,y};this.sprite=scene.physics.add.sprite(x,y,'slime').setScale(1.6).setCollideWorldBounds(true);
    this.sprite.body!.setSize(20,12).setOffset(6,14);this.sprite.play('slime-idle');
  }
  update(x:number,y:number): void {
    const distance=Math.hypot(this.sprite.x-x,this.sprite.y-y);
    if(distance<250&&distance>30)this.sprite.scene.physics.moveTo(this.sprite,x,y,48);
    else if(distance>=250&&Math.hypot(this.sprite.x-this.spawn.x,this.sprite.y-this.spawn.y)>12)this.sprite.scene.physics.moveTo(this.sprite,this.spawn.x,this.spawn.y,30);
    else this.sprite.setVelocity(0,0);
    this.sprite.setDepth(this.sprite.y);
  }
}
