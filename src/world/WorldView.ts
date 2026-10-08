import Phaser from 'phaser';
import { WORLD } from '../data/definitions';
export interface WorldObject { x: number; y: number; kind: 'merchant' | 'forge' | 'feron' | 'auralita'; label: string }
export const INTERACTABLES: WorldObject[] = [
  { x: 808, y: 715, kind: 'merchant', label: 'Elías · comerciante' },
  { x: 1240, y: 704, kind: 'forge', label: 'La herrería de Valdoria' },
  { x: 1490, y: 350, kind: 'feron', label: 'Veta de feron' },
  { x: 1575, y: 420, kind: 'auralita', label: 'Veta de auralita' },
  { x: 1380, y: 380, kind: 'feron', label: 'Veta de feron' },
  { x: 1630, y: 310, kind: 'auralita', label: 'Veta de auralita' },
];
export class WorldView {
  readonly obstacles: Phaser.Physics.Arcade.StaticGroup;
  readonly resourceSprites = new Map<WorldObject, Phaser.GameObjects.Image>();
  private forgeLit=false;
  constructor(private scene: Phaser.Scene) {
    const { width, height } = WORLD;
    scene.add.tileSprite(width/2, height/2, width, height, 'grass');
    this.obstacles = scene.physics.add.staticGroup();
    // Hand-built roads connect Valdoria, the forest and the mine.
    const road = (x: number,y: number,w: number,h: number,texture='path') => scene.add.tileSprite(x+w/2,y+h/2,w,h,texture).setDepth(0);
    road(128,752,1600,96); road(912,384,96,960); road(960,384,544,64);
    road(704,544,576,320,'stone');
    road(740,546,48,150); road(1115,546,48,150);
    const lake = scene.add.graphics().setDepth(0);
    lake.fillStyle(0x597756).fillRoundedRect(80,1010,480,320,80);
    lake.fillStyle(0x284c4e).fillRoundedRect(90,1020,460,300,76);
    lake.fillStyle(0x396867).fillRoundedRect(108,1032,427,277,70);
    for(let i=0;i<45;i++){const x=125+(i*67)%390,y=1050+(i*31)%240;lake.lineStyle(1,0x79a695,0.25).lineBetween(x,y,x+10,y);}
    this.block(90,1020,460,300);
    road(440,1144,152,64); // jetty along the lake bank
    const label=(x:number,y:number,text:string,size=13)=>scene.add.text(x,y,text,{fontFamily:'Georgia, serif',fontSize:size,color:'#e2d2a6',stroke:'#273c30',strokeThickness:4,align:'center'}).setOrigin(0.5).setDepth(2);
    label(984,596,'VALDORIA',22);label(1510,243,'MINAS DE LA AURALITA',14);label(425,363,'BOSQUE DE LOS SUSURROS',15);label(950,1260,'EL CÍRCULO ANTIGUO',14);
    this.prop(765,638,'house',1.3,75,47); this.prop(1132,638,'house',1.3,75,47);
    this.prop(1240,682,'house',1,70,42); this.prop(980,702,'fountain',1.2,48,29);
    this.prop(1490,315,'mine',1.5,110,55);
    // Deterministic scenery: every client loads exactly the same map.
    let seed=847;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<145;i++){
      const x=32+rand()*(width-64),y=55+rand()*(height-100);
      if((y>505&&y<905&&x>650&&x<1370)||(x>875&&x<1035)||(y>720&&y<875)||(y>345&&y<480&&x>920)||(x<600&&y>980)||(x>1320&&y<485)||(x>790&&x<1140&&y>1060))continue;
      this.prop(x,y,'tree',1.2+rand()*0.25,16,14);
    }
    for(const [x,y]of[[550,620],[625,970],[1290,1030],[1720,640],[1300,300],[1440,550],[300,620],[380,920]])this.prop(x,y,'rock',1.3,32,20);
    for(let i=0;i<450;i++){
      const x=rand()*width,y=rand()*height;
      if((y>535&&y<855&&x>700&&x<1300)||(y>746&&y<850)||(x>910&&x<1010)||(x<550&&y>1010))continue;
      const flower=scene.add.graphics().setDepth(0);flower.fillStyle(i%4===0?0xd4bf78:0x708552,0.6).fillRect(x,y,2,2);
      if(i%4===0)flower.fillStyle(0x446340).fillRect(x,y+2,1,3);
    }
    const ruins=scene.add.graphics().setDepth(0);ruins.lineStyle(8,0x64745c).strokeCircle(960,1170,105);ruins.lineStyle(2,0xa2a27d,0.6).strokeCircle(960,1170,87);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;this.prop(960+Math.cos(a)*112,1170+Math.sin(a)*112,'rock',1,24,15);}
    for(const obj of INTERACTABLES){
      if(obj.kind==='feron'||obj.kind==='auralita')this.resourceSprites.set(obj,this.prop(obj.x,obj.y,obj.kind,1.5,25,16));
    }
    scene.add.sprite(808,711,'mage-ember-deep',0).setScale(1.6).setDepth(711);
    label(808,677,'Elías',11);
    const banner=scene.add.graphics().setDepth(860);banner.fillStyle(0x664b33).fillRect(711,852,4,27);banner.fillStyle(0xb18c57).fillRect(715,851,24,14);banner.fillStyle(0x343f31).fillRect(723,854,3,7);
    scene.physics.world.setBounds(16,16,width-32,height-32);
  }
  private block(x:number,y:number,w:number,h:number) {
    const zone=this.scene.add.zone(x+w/2,y+h/2,w,h);this.scene.physics.add.existing(zone,true);this.obstacles.add(zone);
  }
  private prop(x:number,y:number,key:string,scale:number,w:number,h:number): Phaser.GameObjects.Image {
    const image=this.scene.add.image(x,y,key).setOrigin(0.5,0.9).setScale(scale).setDepth(y);
    this.block(x-w/2,y-h/2,w,h);return image;
  }
  nearest(x:number,y:number): WorldObject | null {
    return INTERACTABLES.find(obj=>Math.hypot(obj.x-x,obj.y-y)<82)??null;
  }
  lightForge():void{
    if(this.forgeLit)return;this.forgeLit=true;
    const glow=this.scene.add.ellipse(1242,710,55,28,0xe1b672,0.22).setDepth(704);
    const fire=this.scene.add.graphics().setDepth(715);fire.fillStyle(0x56412e).fillRect(1230,690,22,20);
    fire.fillStyle(0xc47742).fillTriangle(1232,708,1240,689,1248,708);fire.fillStyle(0xf0c974).fillTriangle(1236,708,1241,698,1245,708);
    this.scene.tweens.add({targets:glow,alpha:0.4,duration:850,yoyo:true,repeat:-1});
  }
}
