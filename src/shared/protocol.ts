import type {Character,Direction} from '../data/types';
export const PROTOCOL_VERSION=2;
export const RULES_VERSION=1;
export type Action='sword'|'magic'|'dodge'|'interact'|'potion'|'buy'|'sell'|'contribute'|'train'|'appeal'|'restitute'|'work'|'permit'|'steal'|'rescue'|'review'|'execute';
export interface Input {v:2;campaignId:string;seq:number;dx:number;dy:number;direction:Direction;action?:Action;target?:string}
export interface Actor {id:string;userId?:string;kind:'player'|'enemy'|'npc'|'caravan';name:string;affinity:'swordsman'|'mage';appearance:Character['appearance'];x:number;y:number;direction:Direction;moving:boolean;hp:number;maxHp:number;mana:number;state:'alive'|'downed'|'jailed'|'executed';animation:'idle'|'walk'|'attack'|'hurt'|'death';effect?:{seq:number;action:'sword'|'magic'|'dodge'};protected?:boolean;territory:string}
export interface Evidence {eventId:string;at:number;actorId:string;victimId?:string;territory:string;x:number;y:number;lawVersion:number;witnesses:string[];offense:Offense;selfDefense:boolean;restituted:boolean}
export type Offense='mining'|'trespass'|'theft'|'assault'|'homicide';
export interface LawCase {id:string;characterId:string;evidence:Evidence;status:'open'|'sentenced'|'appealed'|'dismissed'|'resolved'|'reviewed'|'executed';fine:number;jailUntil:number;exileUntil:number;appealUntil:number;capital:boolean;appealResolution?:'upheld'|'reduced'|'overturned';humanReview?:{userId:string;at:number};reason:string}
export interface RealmState {security:number;prosperity:number;supply:number;opinion:number;policy:'normal'|'trade-restriction'|'checkpoint';lawVersion:number}
export interface WorldEvent {id:string;kind:'caravan'|'defense'|'crisis';phase:'active'|'failed'|'recovering'|'complete';startedAt:number;endsAt:number;progress:number;targetId:string;caravanId?:string;notice:string}
export interface Snapshot {v:2;type:'state';campaignId:string;epoch:number;seq:number;ack:number;actors:Actor[];character:Character;cases:LawCase[];realms:Record<string,RealmState>;events:WorldEvent[];reputation:Record<string,number>;permitUntil:number;forge:number;mining:number;notice:string;connected:number}
const ACTIONS:Action[]=['sword','magic','dodge','interact','potion','buy','sell','contribute','train','appeal','restitute','work','permit','steal','rescue','review','execute'];
export function parseInput(raw:unknown,campaignId:string):Input|null{
  if(!raw||typeof raw!=='object')return null;const p=raw as Record<string,unknown>;
  if(p.v!==2||p.campaignId!==campaignId||!Number.isSafeInteger(p.seq)||(p.seq as number)<0||typeof p.dx!=='number'||typeof p.dy!=='number'||![-1,0,1].includes(p.dx)||![-1,0,1].includes(p.dy)||!['up','down','left','right'].includes(String(p.direction))||p.action!==undefined&&!ACTIONS.includes(p.action as Action)||p.target!==undefined&&(typeof p.target!=='string'||p.target.length>100))return null;
  return {v:2,campaignId,seq:p.seq as number,dx:p.dx,dy:p.dy,direction:p.direction as Direction,...p.action?{action:p.action as Action}:{},...p.target?{target:p.target as string}:{}};
}
