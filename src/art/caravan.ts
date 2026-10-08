import type Phaser from 'phaser';
// A code-native pixel wagon: planks, sacks, iron rims and four wheels.
export function caravanTexture(scene:Phaser.Scene):void{
 if(scene.textures.exists('caravan'))return;
 const g=scene.add.graphics();
 const r=(x:number,y:number,w:number,h:number,c:number)=>g.fillStyle(c).fillRect(x,y,w,h);
 r(4,4,32,24,0x362b25);r(8,2,5,6,0x202929);r(28,2,5,6,0x202929);r(8,26,5,6,0x202929);r(28,26,5,6,0x202929);
 r(6,6,28,20,0xa17448);for(let y=7;y<25;y+=4){r(7,y,26,2,0xc09660);r(8,y+2,25,1,0x6d5135);}
 r(5,5,2,22,0x658276);r(33,5,2,22,0x658276);r(7,5,26,2,0x6f4c31);r(7,25,26,2,0x6f4c31);
 for(const[x,y]of [[10,9],[20,8],[15,17],[26,17]]){r(x,y,7,7,0x695b3a);r(x+1,y,5,6,0xc8b682);r(x+2,y+1,3,3,0xe0d2a7);r(x+2,y-1,3,2,0x756644);}
 r(36,14,9,3,0x6d5135);r(43,12,3,7,0x9c8056);
 g.generateTexture('caravan',48,34);g.destroy();
}
