import type { Character } from '../data/types';
export function requiredXp(level:number):number { return 60+level*40; }
export function awardXp(character:Character,amount:number):number {
  if(!Number.isInteger(amount)||amount<0)throw new Error('Invalid XP');
  character.xp+=amount;let levels=0;
  while(character.xp>=requiredXp(character.level)&&character.level<100){character.xp-=requiredXp(character.level);character.level++;levels++;}
  if(character.level>=3&&!character.skills.includes('hybrid'))character.skills.push('hybrid');
  return levels;
}
