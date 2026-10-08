import Phaser from 'phaser';
export class Enemy {
  sprite: Phaser.Physics.Arcade.Sprite;
  health=70;
  lastAttack=0;
  private bar:Phaser.GameObjects.Graphics;
  readonly spawn: {x:number;y:number};
  constructor(scene:Phaser.Scene,x:number,y:number,readonly id:string=crypto.randomUUID()) {
    this.spawn={x,y};this.sprite=scene.physics.add.sprite(x,y,'slime').setScale(1.6).setCollideWorldBounds(true);
    this.bar=scene.add.graphics();this.sprite.once('destroy',()=>this.bar.destroy());
    this.sprite.body!.setSize(20,12).setOffset(6,14);this.sprite.play('slime-idle');
  }
  update(x:number,y:number): void {
    const distance=Math.hypot(this.sprite.x-x,this.sprite.y-y);
    if(distance<250&&distance>30)this.sprite.scene.physics.moveTo(this.sprite,x,y,48);
    else if(distance>=250&&Math.hypot(this.sprite.x-this.spawn.x,this.sprite.y-this.spawn.y)>12)this.sprite.scene.physics.moveTo(this.sprite,this.spawn.x,this.spawn.y,30);
    else this.sprite.setVelocity(0,0);
    this.sprite.setDepth(this.sprite.y);
    this.updateBar();
  }
  updateBar():void{this.bar.clear().setPosition(this.sprite.x-17,this.sprite.y-23).setDepth(this.sprite.y+50);this.bar.fillStyle(0x1b2d23).fillRect(0,0,34,5);this.bar.fillStyle(0xba7460).fillRect(1,1,32*Math.max(0,this.health/70),3);}
  destroy():void{this.sprite.destroy();}
}
