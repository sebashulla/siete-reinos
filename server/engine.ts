import {randomUUID} from 'node:crypto';
import type {Campaign,Character,Direction} from '../src/data/types';
import {statsFor,WORLD} from '../src/data/definitions';
import {awardXp} from '../src/systems/ProgressionSystem';
import {SITES,TERRITORIES,PRISON,inRestricted,moveColliding,territoryAt,walkable} from '../src/shared/world';
import type {Action,Actor,Evidence,Input,LawCase,Offense,RealmState,Snapshot,WorldEvent} from '../src/shared/protocol';
export interface Lot {id:string;item:string;qty:number;illicit:boolean;source:string}
interface PlayerState {character:Character;actor:Actor;lots:Lot[];reputation?:Record<string,number>;lastSeq:number;input:Input|null;lastInputAt:number;cooldowns:Record<string,number>;downUntil:number;permitUntil:number;mine?:{id:string;start:number;requiresPermit:boolean;lawVersion:number};notice:string;mining:number}
export interface SavedWorld {version:2;players:Record<string,PlayerState>;npcs:Actor[];enemies:Actor[];cases:LawCase[];realms:Record<string,RealmState>;events:WorldEvent[];forge:number;nodeUntil:Record<string,number>;nextEventAt:number;eventSerial:number}
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const vector:Record<Direction,{x:number;y:number}>={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
export class WorldEngine {
  state:SavedWorld;
  readonly connected=new Set<string>();
  critical=false;
  audit:Evidence[]=[];
  private animations=new Map<string,number>();
  constructor(readonly campaign:Campaign,saved?:SavedWorld,private hardcoreEnabled=false,private consents=new Set<string>()){
    this.state=saved?.version===2?structuredClone(saved):{version:2,players:{},npcs:[],enemies:[],cases:[],realms:Object.fromEntries(TERRITORIES.map(t=>[t.id,{security:70,prosperity:70,supply:100,opinion:70,policy:'normal',lawVersion:1}])),events:[],forge:0,nodeUntil:{},nextEventAt:0,eventSerial:0};
    if(!saved?.version){
      for(const s of SITES.filter(s=>['merchant','guard','judge','permit'].includes(s.kind))){
        const guard=s.kind==='guard';this.state.npcs.push({id:s.id,kind:'npc',name:s.label,affinity:guard?'swordsman':'mage',appearance:{palette:guard?'forest':'ember',skin:'deep'},x:s.x,y:s.y,direction:'down',moving:false,hp:guard?160:90,maxHp:guard?160:90,mana:100,state:'alive',animation:'idle',protected:true,territory:s.territory});
      }
      [[750,1520],[890,1500],[1260,1400],[1370,1630]].forEach(([x,y],i)=>this.state.enemies.push(this.enemy(`slime-${i}`,x,y)));
    }
  }
  private enemy(id:string,x:number,y:number):Actor{return {id,kind:'enemy',name:'Limo del bosque',affinity:'swordsman',appearance:{palette:'forest',skin:'warm'},x,y,direction:'down',moving:false,hp:70,maxHp:70,mana:0,state:'alive',animation:'idle',territory:territoryAt(x,y).id};}
  add(character:Character):void{
    if(character.campaign_id!==this.campaign.id||character.life_status==='executed')throw new Error('Personaje no autorizado');
    let p=this.state.players[character.id];
    if(!p){const stats=statsFor(character);p={character:structuredClone(character),actor:{id:character.id,userId:character.user_id,kind:'player',name:character.name,affinity:character.affinity,appearance:character.appearance,...WORLD.spawn,direction:'down',moving:false,hp:stats.health,maxHp:stats.health,mana:stats.mana,state:'alive',animation:'idle',territory:'valdoria'},lots:Object.entries(character.inventory).filter(([,qty])=>qty>0).map(([item,qty])=>({id:randomUUID(),item,qty,illicit:false,source:'preserved-character'})),lastSeq:-1,input:null,lastInputAt:0,cooldowns:{},downUntil:0,permitUntil:0,notice:'Bienvenido. Lee las leyes al cruzar una frontera.',mining:0};this.state.players[character.id]=p;this.critical=true;}
    p.character.appearance=character.appearance;p.actor.appearance=character.appearance;
    p.reputation??=Object.fromEntries(TERRITORIES.map(t=>[t.id,0]));
    p.lastSeq=-1;p.input=null;p.lastInputAt=0;this.connected.add(character.id);
  }
  disconnect(id:string):void{this.connected.delete(id);const p=this.state.players[id];if(p){p.input=null;p.actor.moving=false;p.mine=undefined;p.mining=0;this.critical=true;}}
  input(id:string,input:Input,now:number,allowActions=true):boolean{
    const p=this.state.players[id];if(!p||!this.connected.has(id)||input.seq<=p.lastSeq||input.campaignId!==this.campaign.id||p.actor.state==='executed')return false;
    p.lastSeq=input.seq;p.lastInputAt=now;p.actor.direction=input.direction;p.input={...input,action:undefined};
    if(input.action&&allowActions)this.action(p,input.action,input.target,now);return true;
  }
  private animate(a:Actor,animation:Actor['animation'],now:number):void{a.animation=animation;this.animations.set(a.id,now+350);}
  private spend(p:PlayerState,item:string,qty:number,legitimate=true):boolean{
    const available=p.lots.filter(l=>l.item===item&&(!legitimate||!l.illicit)).reduce((n,l)=>n+l.qty,0);if(available<qty)return false;
    let remaining=qty;for(const lot of p.lots)if(lot.item===item&&(!legitimate||!lot.illicit)){const take=Math.min(remaining,lot.qty);lot.qty-=take;remaining-=take;}
    this.aggregate(p);return true;
  }
  private gain(p:PlayerState,item:string,qty:number,source:string,illicit=false):void{p.lots.push({id:randomUUID(),item,qty,source,illicit});this.aggregate(p);}
  private aggregate(p:PlayerState):void{p.lots=p.lots.filter(l=>l.qty>0);for(const item of Object.keys(p.character.inventory))p.character.inventory[item]=0;for(const l of p.lots)p.character.inventory[l.item]=(p.character.inventory[l.item]??0)+l.qty;this.critical=true;}
  private nearby(p:PlayerState,id:string|undefined,kind?:string):boolean{const s=SITES.find(s=>s.id===id);return !!s&&(!kind||s.kind===kind)&&distance(p.actor,s)<82;}
  private action(p:PlayerState,action:Action,target:string|undefined,now:number):void{
    if(p.actor.state==='executed'||p.actor.state==='downed')return;
    if(p.actor.state==='jailed'&&!['work','appeal','restitute','review'].includes(action))return;
    const ready=(key:string,ms:number)=>{if(now-(p.cooldowns[key]??-Infinity)<ms)return false;p.cooldowns[key]=now;return true;};
    if(action==='sword'||action==='magic'){
      const magic=action==='magic';if(!ready(action,magic?650:450)||magic&&p.actor.mana<12)return;
      if(magic)p.actor.mana-=12;p.actor.effect={seq:p.lastSeq,action};this.animate(p.actor,'attack',now);p.mine=undefined;
      const v=vector[p.actor.direction],reach=magic?360:85,stats=statsFor(p.character);
      for(const victim of [...this.state.enemies,...this.state.npcs]){
        const d=distance(p.actor,victim),dot=((victim.x-p.actor.x)*v.x+(victim.y-p.actor.y)*v.y)/(d||1);
        if(victim.hp<=0||d>reach||dot<(magic?.92:.15)||magic&&!this.visible(p.actor,victim))continue;
        const damage=magic?stats.magical:stats.physical+(p.character.skills.includes('hybrid')?Math.floor(stats.magical/2):0);
        victim.hp=Math.max(0,victim.hp-damage);this.animate(victim,victim.hp?'hurt':'death',now);this.critical=true;
        if(victim.protected){const selfDefense=(this.state.nodeUntil[`aggressor:${victim.id}:${p.character.id}`]??0)>now&&(p.cooldowns[`initiated:${victim.id}`]??0)<now;
          this.offense(p,victim.hp?'assault':'homicide',victim.id,now,selfDefense);if(!selfDefense)p.cooldowns[`initiated:${victim.id}`]=now+60000;}
        if(victim.hp===0){victim.state='downed';if(!victim.id.startsWith('event-'))this.state.nodeUntil[`respawn:${victim.id}`]=now+(victim.protected?90000:15000);
          if(victim.kind==='enemy'){awardXp(p.character,45);p.character.coins+=8;p.notice='+45 experiencia · +8 monedas';}
        }if(magic)break;
      }return;
    }
    if(action==='dodge'){if(!ready('dodge',1500))return;p.actor.effect={seq:p.lastSeq,action};const v=vector[p.actor.direction];Object.assign(p.actor,moveColliding(p.actor.x,p.actor.y,v.x*85,v.y*85));p.cooldowns.invulnerable=now+350;this.critical=true;return;}
    if(action==='potion'){if(p.actor.hp>=p.actor.maxHp||!ready('potion',700)||!this.spend(p,'pocion',1))return;p.actor.hp=Math.min(statsFor(p.character).health,p.actor.hp+45);p.notice='Poción utilizada';return;}
    if(action==='interact'){
      const site=SITES.find(s=>s.id===target);if(!site||!this.nearby(p,target))return;
      if(site.kind==='feron'||site.kind==='auralita'){
        if((this.state.nodeUntil[site.id]??0)>now){p.notice='La veta se está recuperando.';return;}
        const realm=this.state.realms[site.territory],requiresPermit=!!site.licensed||realm.policy==='checkpoint';
        p.mine={id:site.id,start:now,requiresPermit,lawVersion:realm.lawVersion};p.notice=requiresPermit?'Veta real: requiere permiso minero.':'Extrayendo mineral de una veta libre.';
      }else p.notice=site.label;return;
    }
    if(action==='permit'&&this.nearby(p,target,'permit')){p.permitUntil=now+3600000;p.notice='Permiso minero gratuito · válido una hora';this.critical=true;return;}
    if(action==='buy'&&this.nearby(p,target,'merchant')&&ready('buy',500)){
      const realm=this.state.realms[p.actor.territory],price=Math.ceil(10*(2-realm.supply/100));if(p.character.coins<price){p.notice=`Necesitas ${price} monedas.`;return;}
      p.character.coins-=price;this.gain(p,'pocion',1,randomUUID());p.notice='Poción comprada';return;
    }
    if(action==='sell'&&this.nearby(p,target,'merchant')&&ready('sell',500)){
      if(!this.spend(p,'feron',1)){p.notice='Necesitas Feron de procedencia legítima.';return;}
      const price=Math.ceil(6*(2-this.state.realms[p.actor.territory].supply/100));p.character.coins+=price;p.notice=`Feron vendido por ${price} monedas.`;this.critical=true;return;
    }
    if(action==='contribute'&&this.nearby(p,'forge')&&this.state.forge<10&&this.spend(p,'feron',1)){this.state.forge++;p.notice=`Herrería: ${this.state.forge}/10`;return;}
    if(action==='train'&&this.nearby(p,'forge')&&this.state.forge>=10&&this.spend(p,'feron',5)){awardXp(p.character,40);p.notice='+40 experiencia';return;}
    if(action==='steal'&&this.nearby(p,target,'chest')&&ready('steal',60000)){
      const eventId=randomUUID();this.gain(p,'feron',2,eventId,true);this.offense(p,'theft',target,now,false,eventId);p.notice='Has tomado bienes protegidos. Puedes restituirlos ante la magistrada.';return;
    }
    if(action==='rescue'){
      const victim=target?this.state.players[target]:undefined;if(!victim||victim.actor.state!=='downed'||distance(p.actor,victim.actor)>82||!ready('rescue',3000))return;
      victim.actor.hp=Math.ceil(victim.actor.maxHp*.35);victim.actor.state='alive';victim.downUntil=0;victim.notice='Tu compañero te ha rescatado.';this.critical=true;return;
    }
    if(action==='work'&&(p.actor.state==='jailed'||this.nearby(p,'work'))&&ready('work',10000)){
      for(const c of this.state.cases.filter(c=>c.characterId===p.character.id&&c.jailUntil>now&&!c.capital))c.jailUntil=Math.max(now,c.jailUntil-15000);
      p.notice='Trabajo comunitario: condena reducida 15 segundos.';this.critical=true;return;
    }
    if(['appeal','restitute','review','execute'].includes(action)){
      const c=this.state.cases.find(c=>c.id===target);if(!c)return;
      const owner=p.character.user_id===this.campaign.owner_id;
      if(c.characterId!==p.character.id&&!(owner&&c.capital))return;
      if(action==='review'||action==='execute'){
        const defendant=this.state.players[c.characterId];
        if(!this.hardcoreEnabled||this.campaign.mode!=='hardcore'||!owner||!c.capital||!defendant||!this.connected.has(defendant.character.id)||now<c.appealUntil||c.appealResolution!=='upheld'||!this.allConsented()||!this.validCapital(c))return;
        if(action==='review'){c.humanReview={userId:p.character.user_id,at:now};c.status='reviewed';this.critical=true;return;}
        if(c.status!=='reviewed'||!c.humanReview)return;
        defendant.character.life_status='executed';defendant.actor.hp=0;defendant.actor.state='executed';c.status='executed';defendant.notice='Sentencia revisada: historia archivada. Puedes crear otro personaje.';this.critical=true;return;
      }
      if(c.status==='dismissed'||c.status==='resolved'||c.status==='executed')return;
      if(p.actor.state!=='jailed'&&!this.nearby(p,'judge')){p.notice='Acércate a la magistrada para presentar tu solicitud.';return;}
      if(action==='restitute'){
        if(c.evidence.offense!=='theft'){p.notice='Esta causa no tiene mercancía que restituir.';return;}
        p.lots=p.lots.filter(l=>l.source!==c.evidence.eventId);this.aggregate(p);c.evidence.restituted=true;c.fine=0;p.notice='Bienes restituidos. Puedes apelar para reducir la sanción.';return;
      }
      if(now>c.appealUntil||c.status==='appealed'||c.status==='reviewed'){p.notice='El plazo de apelación terminó o ya fue utilizado.';return;}
      c.status='appealed';
      if(c.evidence.selfDefense||!c.evidence.witnesses.length){c.status='dismissed';c.jailUntil=now;c.exileUntil=now;c.fine=0;p.character.coins+=c.paidFine??0;c.paidFine=0;c.capital=false;c.appealResolution='overturned';c.reason='Apelación admitida: defensa legítima o pruebas insuficientes.';}
      else if(c.evidence.restituted){c.jailUntil=now;c.exileUntil=now;c.fine=0;c.capital=false;c.status='resolved';c.appealResolution='overturned';c.reason='Apelación admitida tras restitución.';p.reputation![c.evidence.territory]=Math.min(0,p.reputation![c.evidence.territory]+5);}
      else if(c.capital&&this.validCapital(c)){c.appealResolution='upheld';c.reason='Pruebas de reincidencia confirmadas. Requiere revisión humana; nunca hay ejecución automática.';}
      else {c.jailUntil=Math.min(c.jailUntil,now+Math.max(0,(c.jailUntil-now)/2));c.capital=false;c.appealResolution='reduced';c.reason='Revisión: pena reducida; sin ejecución.';}
      p.notice=c.reason;this.critical=true;
    }
  }
  private visible(a:{x:number;y:number},b:{x:number;y:number}):boolean{const steps=Math.ceil(distance(a,b)/24);for(let i=1;i<steps;i++)if(!walkable(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps,0))return false;return true;}
  private offense(p:PlayerState,offense:Offense,victimId:string|undefined,now:number,selfDefense:boolean,eventId=randomUUID(),lawVersion?:number):void{
    if(offense==='assault'&&this.state.cases.some(c=>c.characterId===p.character.id&&c.evidence.offense==='assault'&&now-c.evidence.at<10000))return;
    const territory=p.actor.territory,witnesses=this.state.npcs.filter(n=>n.hp>0&&distance(n,p.actor)<280&&this.visible(n,p.actor)).map(n=>n.id);
    const evidence:Evidence={eventId,at:now,actorId:p.character.id,victimId,territory,x:p.actor.x,y:p.actor.y,lawVersion:lawVersion??this.state.realms[territory].lawVersion,witnesses,offense,selfDefense,restituted:false};
    const previous=this.state.cases.filter(c=>c.characterId===p.character.id&&c.evidence.offense==='homicide'&&!c.evidence.selfDefense&&c.evidence.witnesses.length>0&&!['dismissed','resolved'].includes(c.status)).length;
    const capital=this.campaign.mode==='hardcore'&&this.hardcoreEnabled&&offense==='homicide'&&previous>=1&&!selfDefense&&witnesses.length>0;
    const penalty={mining:{fine:5,jail:0},trespass:{fine:0,jail:0},theft:{fine:10,jail:60000},assault:{fine:5,jail:120000},homicide:{fine:25,jail:600000}}[offense];
    const c:LawCase={id:randomUUID(),characterId:p.character.id,evidence,status:selfDefense?'dismissed':witnesses.length?'sentenced':'open',fine:selfDefense?0:penalty.fine,jailUntil:selfDefense?0:now+(witnesses.length?penalty.jail:0),exileUntil:offense==='homicide'&&!selfDefense&&witnesses.length?now+600000:0,appealUntil:now+600000,capital,reason:selfDefense?'Legítima defensa':`Ley infringida: ${offense} · ${territory}`};
    if(c.status==='sentenced'){const paid=Math.min(p.character.coins,c.fine);p.character.coins-=paid;c.fine-=paid;c.paidFine=paid;p.reputation![territory]=Math.max(-100,p.reputation![territory]-5);this.state.realms[territory].opinion=Math.max(0,this.state.realms[territory].opinion-5);}
    this.state.cases.push(c);this.audit.push(evidence);p.notice=`${c.reason}. Pruebas: ${witnesses.length} testigos. Consulta tu causa.`;this.critical=true;
  }
  private validCapital(c:LawCase):boolean{return c.evidence.offense==='homicide'&&!c.evidence.selfDefense&&c.evidence.witnesses.length>0&&this.state.cases.filter(other=>other.characterId===c.characterId&&other.evidence.offense==='homicide'&&!other.evidence.selfDefense&&other.evidence.witnesses.length>0&&!['dismissed','resolved'].includes(other.status)).length>=2;}
  private allConsented():boolean{return Object.values(this.state.players).every(p=>this.consents.has(p.character.user_id));}
  step(now:number,dt:number):void{
    const delta=Math.min(dt,100)/1000;
    for(const p of Object.values(this.state.players)){
      if(p.actor.state==='executed')continue;
      const stats=statsFor(p.character);p.actor.maxHp=stats.health;p.actor.mana=Math.min(stats.mana,p.actor.mana+delta*7);
      const jailed=this.state.cases.some(c=>c.characterId===p.character.id&&c.jailUntil>now&&!['dismissed','resolved','executed'].includes(c.status));
      if(jailed&&p.actor.state==='jailed'){}else if(!jailed&&p.actor.state==='jailed'){p.actor.state='alive';Object.assign(p.actor,WORLD.spawn);p.notice='Condena cumplida.';this.critical=true;}
      if(p.actor.state==='downed'&&now>=p.downUntil){p.actor.state='alive';p.actor.hp=stats.health;p.actor.mana=stats.mana;Object.assign(p.actor,WORLD.spawn);this.critical=true;}
      const active=this.connected.has(p.character.id)&&p.actor.state==='alive';const input=active&&now-p.lastInputAt<300?p.input:null;
      const dx=input?.dx??0,dy=input?.dy??0,len=Math.hypot(dx,dy)||1;
      if(p.actor.state==='alive')Object.assign(p.actor,moveColliding(p.actor.x,p.actor.y,dx/len*stats.speed*delta,dy/len*stats.speed*delta));
      p.actor.moving=Boolean(dx||dy);if(now>(this.animations.get(p.actor.id)??0))p.actor.animation=p.actor.state==='downed'?'death':p.actor.moving?'walk':'idle';
      const territory=territoryAt(p.actor.x,p.actor.y).id;
      if(p.actor.territory!==territory){p.actor.territory=territory;p.notice=`Entraste en ${territoryAt(p.actor.x,p.actor.y).name}. Consulta sus leyes.`;}
      if(active&&inRestricted(p.actor.x,p.actor.y)&&now-(p.cooldowns.trespass??0)>10000){p.cooldowns.trespass=now;this.offense(p,'trespass',undefined,now,false);p.actor.y=2050;p.notice='Zona restringida: has sido expulsado.';}
      if(active&&this.state.cases.some(c=>c.characterId===p.character.id&&c.exileUntil>now&&c.evidence.territory===territory&&!c.capital&&!['dismissed','resolved'].includes(c.status))){Object.assign(p.actor,territory==='valdoria'?{x:1120,y:1880}:WORLD.spawn);p.notice='Exilio temporal: explora otro territorio o presenta una apelación.';this.critical=true;}
      if(p.mine){const site=SITES.find(s=>s.id===p.mine!.id)!;p.mining=Math.min(1,(now-p.mine.start)/2200);
        if(!active||distance(p.actor,site)>82){p.mine=undefined;p.mining=0;}
        else if(p.mining>=1){const eventId=randomUUID();if(p.mine.requiresPermit&&p.permitUntil<now){this.offense(p,'mining',site.id,now,false,eventId,p.mine.lawVersion);p.notice='Minería ilegal: el mineral extraído fue decomisado. Solicita permiso gratuito.';}
          else{this.gain(p,site.kind,1,eventId);awardXp(p.character,12);p.notice=`+1 ${site.kind} · +12 experiencia`;}
          this.state.nodeUntil[site.id]=now+20000;p.mine=undefined;p.mining=0;this.critical=true;
        }
      }
    }
    for(const n of [...this.state.npcs,...this.state.enemies]){
      if(!n.hp){if(now>=(this.state.nodeUntil[`respawn:${n.id}`]??Infinity)){n.hp=n.maxHp;n.state='alive';n.animation='idle';this.critical=true;}continue;}
      if(now>(this.animations.get(n.id)??0))n.animation=n.moving?'walk':'idle';
      if(n.kind==='enemy'){
        const defending=this.state.events.some(e=>e.kind==='defense'&&e.targetId===n.id&&e.phase==='active');
        const cargo=this.state.npcs.find(a=>(a.kind==='caravan'||defending&&a.id==='merchant-eldara')&&a.hp>0&&distance(a,n)<260);
        if(cargo){const d=distance(n,cargo);if(d>30){Object.assign(n,moveColliding(n.x,n.y,(cargo.x-n.x)/(d||1)*48*delta,(cargo.y-n.y)/(d||1)*48*delta));n.moving=true;}
          else if(now-(this.state.nodeUntil[`attack:${n.id}`]??0)>1000){this.state.nodeUntil[`attack:${n.id}`]=now;cargo.hp=Math.max(0,cargo.hp-8);cargo.state=cargo.hp?'alive':'downed';this.critical=true;}continue;}
        const targets=Object.values(this.state.players).filter(p=>this.connected.has(p.character.id)&&p.actor.state==='alive').sort((a,b)=>distance(a.actor,n)-distance(b.actor,n));
        const target=targets[0];n.moving=false;if(!target)continue;const d=distance(n,target.actor);
        if(d<300&&d>30){Object.assign(n,moveColliding(n.x,n.y,(target.actor.x-n.x)/(d||1)*48*delta,(target.actor.y-n.y)/(d||1)*48*delta));n.moving=true;}
        if(d<38&&now-(this.state.nodeUntil[`attack:${n.id}`]??0)>1000&&now>(target.cooldowns.invulnerable??0)){this.state.nodeUntil[`attack:${n.id}`]=now;this.hurt(target,12,now);}
      }else if(n.id.startsWith('guard')){
        const crisis=this.state.events.some(e=>e.kind==='crisis'&&e.phase==='active');
        const innocent=n.territory==='duncrest'&&crisis?Object.values(this.state.players).find(p=>this.connected.has(p.character.id)&&p.actor.state==='alive'&&distance(p.actor,n)<70):undefined;
        if(innocent&&now-(this.state.nodeUntil[`curse:${n.id}`]??0)>3000){this.state.nodeUntil[`curse:${n.id}`]=now;this.state.nodeUntil[`aggressor:${n.id}:${innocent.character.id}`]=now+15000;this.hurt(innocent,6,now);innocent.notice='Guardia poseído por la crisis: puedes defenderte legítimamente.';}
        const wanted=Object.values(this.state.players).find(p=>this.connected.has(p.character.id)&&p.actor.state==='alive'&&distance(n,p.actor)<300&&this.state.cases.some(c=>c.characterId===p.character.id&&c.jailUntil>now&&!['dismissed','resolved'].includes(c.status)));
        n.moving=false;if(wanted){const d=distance(n,wanted.actor);if(d>35){Object.assign(n,moveColliding(n.x,n.y,(wanted.actor.x-n.x)/d*110*delta,(wanted.actor.y-n.y)/d*110*delta));n.moving=true;}else{wanted.actor.state='jailed';Object.assign(wanted.actor,PRISON);wanted.notice='Arrestado: puedes apelar, restituir o trabajar para reducir la condena.';this.critical=true;}}
        else{const site=SITES.find(s=>s.id===n.id)!;const d=distance(n,site);if(d>5){Object.assign(n,moveColliding(n.x,n.y,(site.x-n.x)/d*80*delta,(site.y-n.y)/d*80*delta));n.moving=true;}}
      }
    }
    this.events(now,delta);
  }
  private hurt(p:PlayerState,damage:number,now:number):void{p.actor.hp=Math.max(0,p.actor.hp-damage);this.animate(p.actor,'hurt',now);this.critical=true;if(!p.actor.hp){p.actor.state='downed';p.downUntil=now+30000;p.mine=undefined;p.notice='Has caído. Un compañero puede rescatarte con E durante 30 segundos.';}}
  private events(now:number,delta:number):void{
    if(!this.state.nextEventAt){this.state.nextEventAt=now+60000;this.critical=true;}
    if(now>=this.state.nextEventAt){const kind=(['caravan','defense','crisis'] as const)[this.state.eventSerial++%3];const id=`event-${this.state.eventSerial}`;
      const event:WorldEvent={id,kind,phase:'active',startedAt:now,endsAt:now+120000,progress:0,targetId:`${id}-enemy`,notice:kind==='caravan'?'Caravana asaltada cerca de Valdoria. Derrota a los atacantes.':kind==='defense'?'Defiende el puesto del bosque.':'Crisis arcana en las minas. Neutraliza las criaturas.'};
      this.state.events.push(event);const point=kind==='caravan'?{x:3400,y:2230}:kind==='defense'?{x:1260,y:1680}:{x:4280,y:1580};
      if(kind==='caravan'){event.caravanId=`${id}-caravan`;this.state.npcs.push({id:event.caravanId,kind:'caravan',name:'Caravana de suministros',affinity:'swordsman',appearance:{palette:'ember',skin:'warm'},x:3320,y:2220,direction:'right',moving:false,hp:240,maxHp:240,mana:0,state:'alive',animation:'idle',territory:'valdoria'});}
      if(kind==='crisis'){this.state.realms.duncrest.policy='checkpoint';this.state.realms.duncrest.lawVersion++;event.notice+=' Permiso obligatorio en todas las vetas mientras dure la crisis. Los guardias pueden quedar poseídos.';}
      this.state.enemies.push(this.enemy(event.targetId,point.x,point.y));this.state.nextEventAt=now+180000;this.critical=true;
      for(const p of Object.values(this.state.players))p.notice=event.notice;
    }
    for(const event of this.state.events){
      const enemy=this.state.enemies.find(n=>n.id===event.targetId);const realm=this.state.realms[event.kind==='defense'?'eldara':event.kind==='crisis'?'duncrest':'valdoria'];
      const caravan=this.state.npcs.find(n=>n.id===event.caravanId);
      if(caravan){caravan.moving=false;if(caravan.hp>0&&(!enemy||enemy.hp<=0)&&caravan.x<3650){caravan.x+=36*delta;caravan.moving=true;}event.progress=Math.min(1,(caravan.x-3320)/330);}
      if(event.phase==='active'&&enemy&&enemy.hp<=0){event.phase='recovering';event.endsAt=now+30000;event.notice='Objetivo recuperado: los suministros vuelven gradualmente.';this.critical=true;}
      else if(event.phase==='active'&&(now>=event.endsAt||caravan&&caravan.hp===0||event.kind==='defense'&&this.state.npcs.find(n=>n.id==='merchant-eldara')?.hp===0)){event.phase='failed';event.endsAt=now+120000;realm.supply=Math.max(30,realm.supply-30);realm.security=Math.max(20,realm.security-20);realm.prosperity=Math.max(20,realm.prosperity-10);realm.opinion=Math.max(20,realm.opinion-10);realm.policy=event.kind==='crisis'?'checkpoint':'trade-restriction';realm.lawVersion++;event.notice='El ataque provocó escasez. Recupera el objetivo para normalizar el comercio.';this.critical=true;}
      else if(event.phase==='failed'&&enemy&&enemy.hp<=0){event.phase='recovering';event.endsAt=now+30000;if(caravan){caravan.hp=120;caravan.state='alive';}this.critical=true;}
      else if(event.phase==='recovering'&&now>=event.endsAt){event.phase='complete';realm.supply=Math.min(100,realm.supply+30);realm.security=Math.min(100,realm.security+20);realm.prosperity=Math.min(100,realm.prosperity+10);realm.opinion=Math.min(100,realm.opinion+10);realm.policy='normal';realm.lawVersion++;this.state.enemies=this.state.enemies.filter(n=>n.id!==event.targetId);this.state.npcs=this.state.npcs.filter(n=>n.id!==event.caravanId);this.critical=true;}
      if(event.phase==='recovering'&&now-(this.state.nodeUntil[`recover:${event.id}`]??0)>1000){this.state.nodeUntil[`recover:${event.id}`]=now;realm.supply=Math.min(100,realm.supply+1);event.progress=Math.max(event.progress,1-(event.endsAt-now)/30000);this.critical=true;}
    }
    this.state.events=this.state.events.filter(e=>e.phase!=='complete'||now-e.endsAt<180000);
  }
  snapshot(id:string,seq:number,epoch:number):Snapshot{
    const p=this.state.players[id];const actors=[...Object.values(this.state.players).filter(other=>this.connected.has(other.character.id)).map(other=>other.actor),...this.state.npcs,...this.state.enemies];
    const owner=p.character.user_id===this.campaign.owner_id;
    return {v:2,type:'state',campaignId:this.campaign.id,seq,epoch,ack:p.lastSeq,actors:actors.filter(a=>a.id===id||distance(a,p.actor)<1250),character:p.character,cases:this.state.cases.filter(c=>c.characterId===id||owner&&c.capital),realms:this.state.realms,events:this.state.events,reputation:p.reputation??{},permitUntil:p.permitUntil,forge:this.state.forge,mining:p.mining,notice:p.notice,connected:this.connected.size};
  }
  export():SavedWorld{return structuredClone(this.state);}
  // During an in-flight transaction only motion advances. Critical simulation
  // resumes once that exact commit has been acknowledged by PostgreSQL.
  stepMotion(now:number,dt:number):void{
    for(const p of Object.values(this.state.players)){
      const input=this.connected.has(p.character.id)&&p.actor.state==='alive'&&now-p.lastInputAt<300?p.input:null;
      const dx=input?.dx??0,dy=input?.dy??0,len=Math.hypot(dx,dy)||1,speed=statsFor(p.character).speed;
      Object.assign(p.actor,moveColliding(p.actor.x,p.actor.y,dx/len*speed*Math.min(dt,100)/1000,dy/len*speed*Math.min(dt,100)/1000));
      p.actor.moving=!!(dx||dy);p.actor.animation=p.actor.state==='downed'||p.actor.state==='executed'?'death':p.actor.moving?'walk':'idle';
    }
  }
  updateMembers(members:Set<string>,consents:Set<string>):void{
    this.consents=consents;
    for(const [id,p] of Object.entries(this.state.players))if(!members.has(p.character.user_id)){
      this.connected.delete(id);delete this.state.players[id];this.critical=true;
    }
  }
}
