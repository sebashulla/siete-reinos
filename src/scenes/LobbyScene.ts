import Phaser from 'phaser';
import { preloadArt, registerAnimations } from '../art/sprites';
import { WorldView } from '../world/WorldView';
export class LobbyScene extends Phaser.Scene {
  constructor(){super('LobbyScene');}
  preload():void{preloadArt(this);}
  create():void{
    registerAnimations(this);new WorldView(this);
    this.cameras.main.setZoom(0.92).centerOn(1060,700);
    this.add.sprite(966,805,'swordsman-forest-warm').setScale(1.8).setDepth(805).play('swordsman-forest-warm:idle:down');
    this.add.sprite(1020,791,'mage-violet-deep').setScale(1.8).setDepth(791).play('mage-violet-deep:idle:left');
    // Menu illustration only; these never appear as connected players.
    this.cameras.main.setBackgroundColor('#344e37');
  }
}
