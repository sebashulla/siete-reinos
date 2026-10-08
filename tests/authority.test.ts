import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine} from '../server/engine';
import {starterCharacter} from '../src/data/character';
import type {Campaign,Character} from '../src/data/types';
import {parseInput,type Action,type LawCase} from '../src/shared/protocol';
import {SITES,TERRITORIES,walkable,moveColliding} from '../src/shared/world';
import {WORLD,statsFor} from '../src/data/definitions';
const campaign:Campaign={id:'camp-a',name:'Tests',owner_id:'user-0',invite_code:'AAA',mode:'casual',rules_version:1,created_at:new Date().toISOString()};
function character(i=0):Character{return {...starterCharacter(`Hero_${i}`,'swordsman',{palette:'forest',skin:'warm'}),id:`char-${i}`,user_id:`user-${i}`,campaign_id:campaign.id,coins:80,inventory:{feron:5,pocion:3,auralita:2}};}
function setup(n=1,hardcore=false){const e=new WorldEngine({...campaign,mode:hardcore?'hardcore':'casual'},undefined,hardcore,new Set(Array.from({length:n},(_,i)=>`user-${i}`)));for(let i=0;i<n;i++)e.add(character(i));return e;}
function command(e:WorldEngine,id:string,action:Action,now=100000,target?:string){const p=e.state.players[id];return e.input(id,{v:2,campaignId:campaign.id,seq:p.lastSeq+1,dx:0,dy:0,direction:p.actor.direction,action,target},now);}
function at(e:WorldEngine,id:string,siteId:string){const s=SITES.find(s=>s.id===siteId)!;Object.assign(e.state.players[id].actor,{x:s.x+40,y:s.y,territory:s.territory});}
test('world sectors cover seven jurisdictions with shared collision bounds',()=>{
 assert.equal(WORLD.width,5760);assert.equal(WORLD.height,4320);assert.equal(TERRITORIES.length,7);assert.equal(TERRITORIES.filter(t=>t.populated).length,3);
 assert.equal(walkable(-20,0),false);const next=moveColliding(24,24,-10000,-10000);assert.ok(next.x>=20&&next.y>=20);
});
test('protocol only accepts intentions; sequence, campaign and movement are validated',()=>{
 const base={v:2,campaignId:campaign.id,seq:1,dx:1,dy:0,direction:'right'};
 assert.deepEqual(parseInput({...base,x:9000,hp:999,coins:9999},campaign.id),base);
 for(const extra of [{v:1},{dx:20},{seq:1.2},{action:'grant_coins'},{campaignId:'other'}])assert.equal(parseInput({...base,...extra},campaign.id),null);
 const e=setup();const input=parseInput(base,campaign.id)!;assert.equal(e.input('char-0',input,100000),true);assert.equal(e.input('char-0',input,100050),false);
 const before=e.state.players['char-0'].actor.x;e.step(100050,50);assert.equal(e.state.players['char-0'].actor.x-before,statsFor(character()).speed*.05);
 e.step(100700,50);assert.equal(e.state.players['char-0'].actor.moving,false);
});
test('four peers share combat, HP and loot; attack spam cannot mint rewards',()=>{
 const e=setup(4),p=e.state.players['char-0'];p.actor.direction='right';
 const enemy=e.state.enemies[0];Object.assign(enemy,{x:p.actor.x+45,y:p.actor.y,hp:26});
 command(e,p.character.id,'sword');assert.equal(enemy.hp,0);assert.equal(p.character.coins,88);assert.equal(p.character.xp,45);
 for(let i=0;i<20;i++)command(e,p.character.id,'sword',100001+i);
 assert.equal(p.character.coins,88);assert.equal(e.snapshot('char-1',1,1).actors.find(a=>a.id===enemy.id)?.hp,0);
 assert.equal(e.snapshot('char-0',1,1).connected,4);
 const before=p.character.inventory.pocion;command(e,p.character.id,'potion',101000);assert.equal(p.character.inventory.pocion,before);
 p.actor.hp=20;command(e,p.character.id,'potion',102000);assert.equal(p.actor.hp,65);assert.equal(p.character.inventory.pocion,before-1);
});
test('mining requires proximity, duration, permit and node cooldown',()=>{
 const e=setup(),p=e.state.players['char-0'];const site=SITES.find(s=>s.licensed)!;
 command(e,p.character.id,'interact',100000,site.id);assert.equal(p.mine,undefined);
 at(e,p.character.id,site.id);const before=p.character.inventory[site.kind];command(e,p.character.id,'interact',100000,site.id);e.step(102201,50);
 assert.equal(p.character.inventory[site.kind],before);assert.equal(e.state.cases.at(-1)?.evidence.offense,'mining');
 at(e,p.character.id,'permit');command(e,p.character.id,'permit',102500,'permit');at(e,p.character.id,site.id);
 command(e,p.character.id,'interact',103000,site.id);assert.equal(p.mine,undefined);
 command(e,p.character.id,'interact',123000,site.id);e.step(125201,50);assert.equal(p.character.inventory[site.kind],before+1);
});
test('restitution removes only illicit provenance and an appeal changes the sentence',()=>{
 const e=setup(),p=e.state.players['char-0'];at(e,p.character.id,'chest');command(e,p.character.id,'steal',100000,'chest');
 const c=e.state.cases.at(-1)!;assert.equal(c.evidence.offense,'theft');assert.equal(p.character.inventory.feron,7);
 at(e,p.character.id,'judge');command(e,p.character.id,'restitute',100100,c.id);assert.equal(p.character.inventory.feron,5);
 command(e,p.character.id,'appeal',100200,c.id);assert.equal(c.status,'resolved');assert.equal(c.jailUntil,100200);assert.equal(c.capital,false);
});
test('rescue and persisted UTC deadlines survive a restart; casual never executes',()=>{
 const e=setup(2),p=e.state.players['char-1'];p.actor.state='downed';p.actor.hp=0;p.downUntil=130000;
 command(e,'char-0','rescue',100000,p.character.id);assert.equal(p.actor.state,'alive');assert.ok(p.actor.hp>0);
 p.actor.state='jailed';const c:LawCase={id:'case',characterId:p.character.id,evidence:{eventId:'proof',actorId:p.character.id,at:100000,territory:'valdoria',x:2880,y:2240,lawVersion:1,witnesses:['judge'],offense:'assault',selfDefense:false,restituted:false},status:'sentenced',fine:0,jailUntil:160000,exileUntil:0,appealUntil:200000,capital:false,reason:'test'};
 e.state.cases.push(c);const saved=e.export();const restored=new WorldEngine(campaign,saved);restored.add(character(1));restored.step(170000,50);
 assert.equal(restored.state.players[p.character.id].actor.state,'alive');assert.deepEqual(restored.state.players[p.character.id].character.inventory,p.character.inventory);
 command(e,'char-0','execute',300000,c.id);assert.notEqual(p.actor.state,'executed');
});
test('hardcore execution needs consent, resolved appeal, human review and online defendant',()=>{
 const e=setup(2,true);const defendant=e.state.players['char-1'];
 const cases=Array.from({length:2},(_,i):LawCase=>({id:`capital-${i}`,characterId:defendant.character.id,evidence:{eventId:`proof-${i}`,at:100000,actorId:defendant.character.id,victimId:'merchant-valdoria',territory:'valdoria',x:2880,y:2240,lawVersion:1,witnesses:['judge'],offense:'homicide',selfDefense:false,restituted:false},status:'sentenced',fine:0,jailUntil:700000,exileUntil:700000,appealUntil:100200,capital:true,reason:'test'}));e.state.cases.push(...cases);
 command(e,'char-0','execute',101000,cases[1].id);assert.notEqual(defendant.actor.state,'executed');
 command(e,'char-0','review',101100,cases[1].id);assert.equal(cases[1].humanReview,undefined);
 at(e,defendant.character.id,'judge');command(e,defendant.character.id,'appeal',100150,cases[1].id);assert.equal(cases[1].appealResolution,'upheld');
 e.disconnect(defendant.character.id);command(e,'char-0','review',102000,cases[1].id);assert.equal(cases[1].humanReview,undefined);
 e.add(character(1));e.updateMembers(new Set(['user-0','user-1']),new Set(['user-0']));command(e,'char-0','review',102100,cases[1].id);assert.equal(cases[1].humanReview,undefined);
 e.updateMembers(new Set(['user-0','user-1']),new Set(['user-0','user-1']));command(e,'char-0','review',102200,cases[1].id);assert.ok(cases[1].humanReview);
 cases[0].evidence.witnesses=[];command(e,'char-0','execute',102250,cases[1].id);assert.notEqual(defendant.actor.state,'executed');cases[0].evidence.witnesses=['judge'];
 const disabled=new WorldEngine({...campaign,mode:'hardcore'},e.export(),false,new Set(['user-0','user-1']));disabled.add(character(0));disabled.add(character(1));command(disabled,'char-0','execute',102275,cases[1].id);assert.notEqual(disabled.state.players['char-1'].actor.state,'executed');
 command(e,'char-0','execute',102300,cases[1].id);assert.equal(defendant.actor.state,'executed');assert.equal(defendant.character.life_status,'executed');
});
test('interest filtering protects distant entities while events reach the campaign',()=>{
 const e=setup(2);e.state.players['char-1'].actor.x=5000;e.state.players['char-1'].actor.y=4000;
 e.step(100000,50);e.step(160001,50);const snap=e.snapshot('char-0',1,1);
 assert.ok(!snap.actors.some(a=>a.id==='char-1'));assert.equal(snap.events.length,1);assert.equal(snap.connected,2);
 const event=e.state.events[0];e.step(event.endsAt+1,50);assert.equal(event.phase,'failed');assert.equal(e.state.realms.valdoria.supply,70);
 e.state.enemies.find(n=>n.id===event.targetId)!.hp=0;e.step(event.endsAt+2,50);assert.equal(event.phase,'recovering');e.step(event.endsAt+1,50);assert.equal(event.phase,'complete');assert.equal(e.state.realms.valdoria.supply,100);
});

test('server evidence distinguishes self defense and respects the law at action start',()=>{
 const e=setup(),p=e.state.players['char-0'];at(e,p.character.id,'guard-duncrest');p.actor.direction='left';
 e.state.events.push({id:'crisis-test',kind:'crisis',phase:'active',startedAt:90000,endsAt:200000,progress:0,targetId:'none',notice:'test'});
 e.step(100000,50);assert.ok(p.actor.hp<p.actor.maxHp);
 const coins=p.character.coins;command(e,p.character.id,'sword',100100);
 const proof=e.state.cases.at(-1)!;assert.equal(proof.evidence.selfDefense,true);assert.equal(proof.status,'dismissed');assert.equal(p.character.coins,coins);
 const free=SITES.find(s=>s.id==='vein-0')!;at(e,p.character.id,free.id);e.state.realms.duncrest.policy='normal';
 const qty=p.character.inventory.feron;command(e,p.character.id,'interact',101000,free.id);
 e.state.realms.duncrest.policy='checkpoint';e.state.realms.duncrest.lawVersion++;
 e.step(103201,50);assert.equal(p.character.inventory.feron,qty+1);assert.equal(e.state.cases.length,1);
});
