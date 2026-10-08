import type { WorldObject } from '../world/WorldView';
export class ResourceSystem {
  private used=new Map<WorldObject,number>();
  mining?: {object:WorldObject;started:number};
  begin(object:WorldObject,time:number):boolean {
    if(this.mining||(this.used.get(object)??0)>time)return false;
    this.mining={object,started:time};return true;
  }
  update(time:number,x:number,y:number): {object:WorldObject;complete:boolean;progress:number} | null {
    if(!this.mining)return null;
    const object=this.mining.object;
    if(Math.hypot(x-object.x,y-object.y)>90){this.mining=undefined;return null;}
    const progress=Math.min(1,(time-this.mining.started)/2200);
    if(progress===1){this.used.set(object,time+18000);this.mining=undefined;}
    return {object,complete:progress===1,progress};
  }
}
