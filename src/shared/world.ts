import { WORLD } from '../data/definitions';
export interface Territory { id:string; name:string; populated:boolean; color:number; bounds:{x:number;y:number;w:number;h:number}; center:{x:number;y:number}; laws:string[] }
export const TERRITORIES:Territory[]=[
  {id:'eldara',name:'Éldara · Bosque de los Susurros',populated:true,color:0x476745,bounds:{x:0,y:0,w:1920,h:2880},center:{x:1120,y:1680},laws:['Los civiles están protegidos.','No robes los suministros del bosque.']},
  {id:'valdoria',name:'Corona de Valdoria',populated:true,color:0x778260,bounds:{x:1920,y:1440,w:1920,h:1440},center:WORLD.spawn,laws:['Los civiles están protegidos.','La plaza militar es de acceso restringido.','La extracción en la mina real requiere permiso.']},
  {id:'duncrest',name:'Duncrest · Minas de la Auralita',populated:true,color:0x80785b,bounds:{x:3840,y:0,w:1920,h:2880},center:{x:4350,y:1680},laws:['La veta real requiere permiso.','Restituye los bienes robados.','Los mineros y guardias están protegidos.']},
  {id:'auralis',name:'Santuario de Auralis',populated:false,color:0x6e687e,bounds:{x:1920,y:0,w:1920,h:1440},center:{x:2880,y:720},laws:['Jurisdicción preparada; asentamientos en una futura ampliación.']},
  {id:'umbria',name:'Marismas de Umbría',populated:false,color:0x4b6867,bounds:{x:0,y:2880,w:1920,h:1440},center:{x:960,y:3600},laws:['Jurisdicción preparada; asentamientos en una futura ampliación.']},
  {id:'saharim',name:'Rutas de Saharim',populated:false,color:0x95825c,bounds:{x:1920,y:2880,w:1920,h:1440},center:{x:2880,y:3600},laws:['Jurisdicción preparada; asentamientos en una futura ampliación.']},
  {id:'ceniza',name:'Bastión Ceniza',populated:false,color:0x706660,bounds:{x:3840,y:2880,w:1920,h:1440},center:{x:4800,y:3600},laws:['Jurisdicción preparada; asentamientos en una futura ampliación.']},
];
export function territoryAt(x:number,y:number):Territory {return TERRITORIES.find(t=>x>=t.bounds.x&&y>=t.bounds.y&&x<t.bounds.x+t.bounds.w&&y<t.bounds.y+t.bounds.h)??TERRITORIES[1];}
export interface Prop {id:string;x:number;y:number;key:string;scale:number;w:number;h:number}
export interface Site {id:string;x:number;y:number;kind:'merchant'|'forge'|'feron'|'auralita'|'judge'|'work'|'permit'|'chest'|'guard';label:string;territory:string;licensed?:boolean}
export const SITES:Site[]=[
  {id:'merchant-valdoria',x:2728,y:2155,kind:'merchant',label:'Elías · comerciante',territory:'valdoria'},
  {id:'forge',x:3160,y:2144,kind:'forge',label:'Herrería comunitaria',territory:'valdoria'},
  {id:'judge',x:2940,y:2100,kind:'judge',label:'Magistrada · causas y apelaciones',territory:'valdoria'},
  {id:'work',x:2640,y:2360,kind:'work',label:'Trabajos comunitarios',territory:'valdoria'},
  {id:'permit',x:4230,y:1770,kind:'permit',label:'Supervisora · permiso minero',territory:'duncrest'},
  {id:'guard-valdoria',x:3040,y:2260,kind:'guard',label:'Guardia de Valdoria',territory:'valdoria'},
  {id:'guard-duncrest',x:4330,y:1780,kind:'guard',label:'Guardia de Duncrest',territory:'duncrest'},
  {id:'merchant-eldara',x:1120,y:1680,kind:'merchant',label:'Liria · puesto del bosque',territory:'eldara'},
  {id:'chest',x:1150,y:1750,kind:'chest',label:'Suministros protegidos · tomar sin permiso',territory:'eldara'},
  ...[0,1,2,3,4,5].map(i=>({id:`vein-${i}`,x:4400+(i%3)*100,y:1540+Math.floor(i/3)*100,kind:(i%2?'auralita':'feron') as 'feron'|'auralita',label:i<2?'Veta libre':'Veta real · permiso requerido',territory:'duncrest',licensed:i>=2})),
];
export const PRISON={x:2600,y:2360};
export const RESTRICTED={x:3020,y:1900,w:220,h:130};
export function inRestricted(x:number,y:number):boolean{return x>RESTRICTED.x&&x<RESTRICTED.x+RESTRICTED.w&&y>RESTRICTED.y&&y<RESTRICTED.y+RESTRICTED.h;}
export const ROADS=[{x:100,y:2208,w:5560,h:80},{x:2840,y:120,w:80,h:4080},{x:1080,y:1640,w:3400,h:80},{x:1080,y:1640,w:80,h:640},{x:4310,y:1640,w:80,h:640}];
export const PROPS:Prop[]=[];
const prop=(id:string,x:number,y:number,key:string,scale:number,w:number,h:number)=>PROPS.push({id,x,y,key,scale,w,h});
prop('house-a',2685,2078,'house',1.3,90,55);prop('house-b',3052,2078,'house',1.3,90,55);
prop('forge-house',3160,2110,'house',1,70,42);prop('fountain',2900,2142,'fountain',1.2,48,29);
prop('mine',4490,1450,'mine',1.5,120,60);prop('forest-house',1030,1640,'house',1.2,80,45);
prop('mine-house',4180,1720,'house',1.2,80,45);
for(const site of SITES)if(site.kind==='feron'||site.kind==='auralita')prop(site.id,site.x,site.y,site.kind,1.5,25,16);
let seed=847;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<1250;i++){
  const x=60+rand()*(WORLD.width-120),y=80+rand()*(WORLD.height-160);
  if(ROADS.some(r=>x>r.x-90&&x<r.x+r.w+90&&y>r.y-100&&y<r.y+r.h+100)||SITES.some(s=>Math.hypot(s.x-x,s.y-y)<200)||Math.hypot(x-WORLD.spawn.x,y-WORLD.spawn.y)<480||inRestricted(x,y))continue;
  prop(`tree-${i}`,x,y,'tree',1.2+rand()*.25,18,16);
}
export function walkable(x:number,y:number,radius=12):boolean {
  return x>=20&&y>=20&&x<=WORLD.width-20&&y<=WORLD.height-20&&!PROPS.some(p=>Math.abs(x-p.x)<p.w/2+radius&&Math.abs(y-p.y)<p.h/2+radius);
}
export function moveColliding(x:number,y:number,dx:number,dy:number):{x:number;y:number}{
  // Small steps prevent tunnelling through the same footprints rendered by Phaser.
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/8));
  for(let i=0;i<steps;i++){if(walkable(x+dx/steps,y))x+=dx/steps;if(walkable(x,y+dy/steps))y+=dy/steps;}
  return {x,y};
}
