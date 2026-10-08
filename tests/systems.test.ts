import {test} from 'node:test';
import assert from 'node:assert/strict';
import {awardXp,requiredXp} from '../src/systems/ProgressionSystem';
import {InventorySystem} from '../src/systems/InventorySystem';
import {MessageGate,interpolate,parsePosition,parseInteraction,parseWorld} from '../src/net/protocol';
import {starterCharacter} from '../src/data/character';
import {ResourceSystem} from '../src/systems/ResourceSystem';
const character=()=>starterCharacter('Valdor','swordsman',{palette:'forest',skin:'warm'});
test('XP crosses multiple levels and unlocks hybrid once',()=>{
  const c=character();assert.equal(awardXp(c,requiredXp(1)+requiredXp(2)+12),2);assert.equal(c.level,3);assert.equal(c.xp,12);assert.deepEqual(c.skills,['sword','magic','hybrid']);awardXp(c,500);assert.equal(c.skills.filter(s=>s==='hybrid').length,1);assert.throws(()=>awardXp(c,-1));
});
test('Inventory rejects underflow, negatives and fractions',()=>{
  const c=character(),inventory=new InventorySystem(c);assert.equal(inventory.spend('feron',1),false);inventory.add('feron',2);assert.equal(inventory.spend('feron',2),true);assert.equal(c.inventory.feron,0);assert.throws(()=>inventory.spend('feron',-1));assert.throws(()=>inventory.add('feron',1.5));
});
test('Network packets reject malformed, out-of-bounds and unsafe data',()=>{
  const p={x:960,y:800,direction:'down',moving:true,seq:1};assert.deepEqual(parsePosition({...p,user_id:'spoof'}),p);
  for(const invalid of [null,{}, {...p,x:Infinity},{...p,y:-1},{...p,x:1921},{...p,direction:'diagonal'},{...p,moving:'yes'},{...p,seq:1.5}])assert.equal(parsePosition(invalid),null);
  assert.ok(parseInteraction({...p,action:'magic'}));assert.equal(parseInteraction({...p,action:'grant_coins'}),null);
});
test('Replay and per-peer flood guard keep valid sequence ordering',()=>{
  const gate=new MessageGate();assert.equal(gate.accept(1,'position',2000),true);assert.equal(gate.accept(1,'position',2001),false);assert.equal(gate.accept(0,'position',2002),false);
  assert.equal(gate.accept(1,'interaction',2003),true);for(let i=2;i<30;i++)gate.accept(i,'position',2010);assert.equal(gate.accept(50,'position',2011),false);assert.equal(gate.accept(51,'position',4000),true);
});
test('Interpolation is frame-rate independent and does not overshoot',()=>{
  const once=interpolate(0,100,32),twice=interpolate(interpolate(0,100,16),100,16);assert.ok(Math.abs(once-twice)<1e-9);assert.ok(once>0&&once<100);assert.equal(interpolate(100,100,16),100);
});
test('Mining needs proximity and elapsed time; mined nodes have a cooldown',()=>{
  const resource=new ResourceSystem(),node={x:100,y:100,kind:'feron' as const,label:'Feron'};
  assert.equal(resource.begin(node,1000),true);assert.equal(resource.update(2000,110,100)?.complete,false);
  assert.equal(resource.update(3200,110,100)?.complete,true);assert.equal(resource.begin(node,4000),false);
  assert.equal(resource.begin(node,22000),true);assert.equal(resource.update(23000,300,300),null);assert.equal(resource.mining,undefined);
});
test('Shared world packets bound enemy count, identity, coordinates and health',()=>{
  const enemy={id:'slime-0',x:480,y:460,health:70};assert.deepEqual(parseWorld({seq:1,enemies:[enemy]}),{seq:1,enemies:[enemy]});
  assert.equal(parseWorld({seq:1,enemies:[enemy,enemy]}),null);assert.equal(parseWorld({seq:1,enemies:[{...enemy,health:999}]}),null);assert.equal(parseWorld({seq:1,enemies:[{...enemy,x:Infinity}]}),null);
});
