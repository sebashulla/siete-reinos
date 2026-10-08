import { DIRECTIONS, type Interaction, type Position, type WorldSnapshot } from '../data/types';
import { WORLD } from '../data/definitions';
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function coordinates(p: Record<string, unknown>): boolean {
  return typeof p.x === 'number' && Number.isFinite(p.x) && p.x >= 0 && p.x <= WORLD.width
    && typeof p.y === 'number' && Number.isFinite(p.y) && p.y >= 0 && p.y <= WORLD.height
    && DIRECTIONS.includes(p.direction as never) && Number.isSafeInteger(p.seq) && (p.seq as number) >= 0;
}
export function parsePosition(value: unknown): Position | null {
  if (!record(value) || !coordinates(value) || typeof value.moving !== 'boolean') return null;
  return { x: value.x as number, y: value.y as number, direction: value.direction as Position['direction'], moving: value.moving, seq: value.seq as number };
}
export function parseInteraction(value: unknown): Interaction | null {
  if (!record(value) || !coordinates(value) || !['sword', 'magic', 'dodge', 'mine'].includes(value.action as string)) return null;
  return { action: value.action as Interaction['action'], x: value.x as number, y: value.y as number, direction: value.direction as Interaction['direction'], seq: value.seq as number };
}
export function interpolate(current: number, target: number, deltaMs: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.min(deltaMs, 100) / 70));
}
export function parseWorld(value:unknown):WorldSnapshot|null {
  if(!record(value)||!Number.isSafeInteger(value.seq)||(value.seq as number)<0||!Array.isArray(value.enemies)||value.enemies.length>8)return null;
  const ids=new Set<string>();const enemies:WorldSnapshot['enemies']=[];
  for(const enemy of value.enemies){
    if(!record(enemy)||typeof enemy.id!=='string'||!/^slime-[0-3]$/.test(enemy.id)||ids.has(enemy.id)
      ||!coordinates({...enemy,direction:'down',seq:0})||typeof enemy.health!=='number'||!Number.isFinite(enemy.health)||enemy.health<=0||enemy.health>70)return null;
    ids.add(enemy.id);enemies.push({id:enemy.id,x:enemy.x as number,y:enemy.y as number,health:enemy.health});
  }
  return {seq:value.seq as number,enemies};
}
export class MessageGate {
  private positionSeq = -1;
  private interactionSeq = -1;
  private worldSeq=-1;
  private window = 0;
  private count = 0;
  accept(seq: number, kind: 'position' | 'interaction'|'world', now: number): boolean {
    if (now - this.window > 1000) { this.window = now; this.count = 0; }
    if (++this.count > 30) return false;
    if (seq <= (kind === 'position' ? this.positionSeq : kind==='world'?this.worldSeq:this.interactionSeq)) return false;
    if (kind === 'position') this.positionSeq = seq; else if(kind==='world')this.worldSeq=seq;else this.interactionSeq = seq;
    return true;
  }
}
