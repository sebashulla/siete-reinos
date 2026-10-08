import type { Character } from '../data/types';
export class InventorySystem {
  constructor(readonly character:Character) {}
  add(id:string,amount:number):void { if(!Number.isInteger(amount)||amount<0)throw new Error('Invalid quantity');this.character.inventory[id]=(this.character.inventory[id]??0)+amount; }
  spend(id:string,amount:number):boolean {
    if(!Number.isInteger(amount)||amount<=0)throw new Error('Invalid quantity');
    if((this.character.inventory[id]??0)<amount)return false;
    this.character.inventory[id]-=amount;return true;
  }
}
