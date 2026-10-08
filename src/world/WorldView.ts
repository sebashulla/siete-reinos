import Phaser from 'phaser';
import {WORLD} from '../data/definitions';
import {PROPS,ROADS,SITES,TERRITORIES,type Site} from '../shared/world';
export type WorldObject=Site;
export const INTERACTABLES=SITES;
export class WorldView {
 readonly obstacles:Phaser.Physics.Arcade.StaticGroup;
 readonly resourceSprites=new Map<WorldObject,Phaser.GameObjects.Image>();
 private sectors=new Map<string,Phaser.GameObjects.GameObject[]>();private lastSector='';private forgeLit=false;
 constructor(private scene:Phaser.Scene,showNpcs=true){
  scene.add.tileSprite(WORLD.width/2,WORLD.height/2,WORLD.width,WORLD.height,'grass').setDepth(-10);this.obstacles=scene.physics.add.staticGroup();
  for(const t of TERRITORIES){const g=scene.add.graphics().setDepth(-9);g.fillStyle(t.color,.15).fillRect(t.bounds.x,t.bounds.y,t.bounds.w,t.bounds.h);g.lineStyle(3,t.color,.35).strokeRect(t.bounds.x,t.bounds.y,t.bounds.w,t.bounds.h);
   scene.add.text(t.center.x,t.center.y-360,t.name.toUpperCase(),{fontFamily:'Georgia',fontSize:t.populated?'21px':'17px',color:'#e1d2aa',stroke:'#22382a',strokeThickness:4}).setOrigin(.5).setDepth(1);
   if(!t.populated)scene.add.text(t.center.x,t.center.y-150,'FRONTERA · CONTENIDO EN FUTURAS AMPLIACIONES',{fontSize:'10px',color:'#b9c9ae'}).setOrigin(.5);
  }
  for(const r of ROADS)scene.add.tileSprite(r.x+r.w/2,r.y+r.h/2,r.w,r.h,'path').setDepth(-2);
  scene.add.tileSprite(2880,2200,570,400,'stone').setDepth(-1);
  for(const s of SITES){if(['merchant','guard','judge','permit'].includes(s.kind)&&showNpcs){const key=s.kind==='guard'?'swordsman-forest-warm':'mage-ember-deep';scene.add.sprite(s.x,s.y,key,0).setScale(1.8).setDepth(s.y);scene.add.text(s.x,s.y-40,s.label,{fontSize:'10px',color:'#eee0b8',stroke:'#203a2a',strokeThickness:3}).setOrigin(.5).setDepth(s.y+50);}if(s.kind==='chest')scene.add.image(s.x,s.y,'feron').setTint(0xc5a262).setScale(2).setDepth(s.y);}
  const prison=scene.add.graphics().setDepth(-1);prison.lineStyle(3,0x9b9b7b).strokeRect(2540,2300,120,130);scene.add.text(2600,2310,'PRISIÓN',{fontSize:'10px',color:'#d1c49e'}).setOrigin(.5).setDepth(2400);
  scene.physics.world.setBounds(16,16,WORLD.width-32,WORLD.height-32);this.update(WORLD.spawn.x,WORLD.spawn.y);
 }
 update(x:number,y:number):void{
  const sx=Math.floor(x/1024),sy=Math.floor(y/1024),key=`${sx}:${sy}`;if(key===this.lastSector)return;this.lastSector=key;
  const wanted=new Set<string>();for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)wanted.add(`${sx+dx}:${sy+dy}`);
  for(const [k,objects]of this.sectors)if(!wanted.has(k)){for(const obj of objects)obj.destroy();this.sectors.delete(k);}
  for(const k of wanted)if(!this.sectors.has(k)){const objects:Phaser.GameObjects.GameObject[]=[];
   for(const p of PROPS.filter(p=>`${Math.floor(p.x/1024)}:${Math.floor(p.y/1024)}`===k)){const image=this.scene.add.image(p.x,p.y,p.key).setOrigin(.5,.9).setScale(p.scale).setDepth(p.y);objects.push(image);const zone=this.scene.add.zone(p.x,p.y,p.w,p.h);this.scene.physics.add.existing(zone,true);this.obstacles.add(zone);objects.push(zone);}this.sectors.set(k,objects);
  }
 }
 nearest(x:number,y:number):Site|null{return SITES.find(s=>Math.hypot(s.x-x,s.y-y)<82)??null;}
 lightForge():void{if(this.forgeLit)return;this.forgeLit=true;const fire=this.scene.add.graphics().setDepth(2180);fire.fillStyle(0xd89149).fillTriangle(3145,2155,3160,2122,3175,2155);fire.fillStyle(0xffda81).fillTriangle(3151,2155,3160,2135,3169,2155);}
}
