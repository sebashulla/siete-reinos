import Phaser from 'phaser';
import { AFFINITIES, DIRECTIONS, PALETTES, type ActorAction, type Affinity, type Appearance, type Direction } from '../data/types';
export const ACTIONS: ActorAction[] = ['idle', 'walk', 'attack', 'hurt', 'death'];
export function spriteKey(affinity: Affinity, appearance: Appearance) { return `${affinity}-${appearance.palette}-${appearance.skin}`; }
export function preloadArt(scene: Phaser.Scene): void {
  for (const kind of AFFINITIES) for (const palette of PALETTES) for (const skin of ['warm', 'deep', 'light']) {
    const key = `${kind}-${palette}-${skin}`;
    scene.load.spritesheet(key, `/assets/${key}.png`, { frameWidth: 32, frameHeight: 32 });
  }
  for (const key of ['grass', 'path', 'water', 'stone', 'tree', 'house', 'rock', 'mine', 'fountain', 'feron', 'auralita']) scene.load.image(key, `/assets/${key}.png`);
  scene.load.spritesheet('slime', '/assets/slime.png', { frameWidth: 32, frameHeight: 32 });
}
export function registerAnimations(scene: Phaser.Scene): void {
  for (const kind of AFFINITIES) for (const palette of PALETTES) for (const skin of ['warm', 'deep', 'light']) {
    const key = `${kind}-${palette}-${skin}`;
    ACTIONS.forEach((action, a) => DIRECTIONS.forEach((direction, d) => {
      const start = (a * 4 + d) * 8;
      const anim = `${key}:${action}:${direction}`;
      if (!scene.anims.exists(anim)) scene.anims.create({ key: anim,
        frames: scene.anims.generateFrameNumbers(key, { start, end: start + 7 }),
        frameRate: { idle: 5, walk: 10, attack: 18, hurt: 16, death: 10 }[action],
        repeat: action === 'idle' || action === 'walk' ? -1 : 0 });
    }));
  }
  if (!scene.anims.exists('slime-idle')) scene.anims.create({ key: 'slime-idle', frames: scene.anims.generateFrameNumbers('slime', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
}
export function playActor(sprite: Phaser.GameObjects.Sprite, action: ActorAction, direction: Direction): void {
  sprite.play(`${sprite.texture.key}:${action}:${direction}`, true);
}
