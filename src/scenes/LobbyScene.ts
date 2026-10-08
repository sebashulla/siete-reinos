import Phaser from 'phaser';
import { preloadArt, registerAnimations } from '../art/sprites';
import { WorldView } from '../world/WorldView';
import { WORLD } from '../data/definitions';
export class LobbyScene extends Phaser.Scene {
  constructor(){super('LobbyScene');}
  preload():void{preloadArt(this);}
  create():void{
    registerAnimations(this);new WorldView(this);
    this.cameras.main.setZoom(.92).centerOn(WORLD.spawn.x+100,WORLD.spawn.y-100);
    this.add.sprite(WORLD.spawn.x+6,WORLD.spawn.y+5,'swordsman-forest-warm').setScale(1.8).setDepth(WORLD.spawn.y+5).play('swordsman-forest-warm:idle:down');
    this.add.sprite(WORLD.spawn.x+60,WORLD.spawn.y-9,'mage-violet-deep').setScale(1.8).setDepth(WORLD.spawn.y-9).play('mage-violet-deep:idle:left');
    // Menu illustration only; these never appear as connected players.
    this.cameras.main.setBackgroundColor('#344e37');
  }
}
