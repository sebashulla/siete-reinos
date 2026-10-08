import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const credentials=[['A',process.env.TEST_EMAIL_A,process.env.TEST_PASSWORD_A],['B',process.env.TEST_EMAIL_B,process.env.TEST_PASSWORD_B]];
if(!url||!key||credentials.some(([,email,password])=>!email||!password))throw new Error('Set public Supabase variables and TEST_EMAIL_A/B + TEST_PASSWORD_A/B in .env.local. Use confirmed test accounts.');
const make=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const clients=[make(),make()],outsider=make(),channels=[];
const report={date:new Date().toISOString(),project:new URL(url).hostname,completed:false,checks:[]};
function checked(text){report.checks.push(text);console.log('PASS',text);}
function subscribe(client,topic,handlers={}){
  const channel=client.channel(topic,{config:{private:true,broadcast:{ack:true,self:false},presence:{key:crypto.randomUUID()}}});channels.push([client,channel]);
  channel.on('presence',{event:'sync'},()=>{});
  for(const[event,cb]of Object.entries(handlers))channel.on('broadcast',{event},cb);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Channel join timed out: '+topic)),12000);channel.subscribe((status,error)=>{
    if(status==='SUBSCRIBED'){clearTimeout(timer);resolve(channel);}if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){clearTimeout(timer);reject(new Error(error?.message??status));}
  });});
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,description){const start=Date.now();while(!predicate()){if(Date.now()-start>7000)throw new Error('Timed out: '+description);await pause(150);}}
let room,users=[];
try{
  for(let i=0;i<2;i++){
    const[,email,password]=credentials[i];const {data,error}=await clients[i].auth.signInWithPassword({email,password});if(error)throw error;
    users.push(data.user);await clients[i].realtime.setAuth(data.session.access_token);
    let {data:character,error:loadError}=await clients[i].from('characters').select('*').eq('user_id',data.user.id).maybeSingle();if(loadError)throw loadError;
    if(!character){const {data:created,error:createError}=await clients[i].rpc('create_character',{p_name:`QA_${i?'Luna':'Sol'}_${Date.now().toString(36).slice(-5)}`,p_affinity:i?'mage':'swordsman',p_appearance:{palette:i?'violet':'forest',skin:i?'deep':'warm'}});if(createError)throw createError;character=created;}
    assert.equal(character.user_id,data.user.id);assert.equal(character.level,1);
    const {data:existing}=await clients[i].from('rooms').select('id').maybeSingle();if(existing){const {error:leaveError}=await clients[i].rpc('leave_room',{p_room:existing.id});if(leaveError)throw leaveError;}
  }
  assert.notEqual(users[0].id,users[1].id);checked('Two distinct Supabase Auth accounts with independent JWT sessions and persisted characters');
  const {data:created,error}=await clients[0].rpc('create_room');if(error)throw error;room=created;
  const {data:joined,error:joinError}=await clients[1].rpc('join_room',{p_code:room.code});if(joinError)throw joinError;assert.equal(joined.id,room.id);
  for(const client of clients){const {data:roster,error:rosterError}=await client.rpc('room_roster',{p_room:room.id});if(rosterError)throw rosterError;assert.equal(roster.length,2);}
  checked('A created a private room; B joined by code; both rosters contain two members');
  const receivedA=[],receivedB=[],attacksB=[],ownerMessagesA=[],ownerMessagesB=[],worldsB=[];
  const topicA=`room:${room.id}:player:${users[0].id}`,topicB=`room:${room.id}:player:${users[1].id}`;
  const sendA=await subscribe(clients[0],topicA,{move:({payload})=>ownerMessagesA.push(payload)}),sendB=await subscribe(clients[1],topicB,{move:({payload})=>ownerMessagesB.push(payload)});
  const readA=await subscribe(clients[0],topicB,{move:({payload})=>receivedA.push(payload)});
  const readB=await subscribe(clients[1],topicA,{move:({payload})=>receivedB.push(payload),action:({payload})=>attacksB.push(payload),world:({payload})=>worldsB.push(payload)});
  await sendA.track({connected_at:new Date().toISOString()});await sendB.track({connected_at:new Date().toISOString()});
  await until(()=>Object.values(readA.presenceState()).flat().length>0&&Object.values(readB.presenceState()).flat().length>0,'bidirectional Presence');
  checked('Private Presence is visible in both directions');
  await sendA.send({type:'broadcast',event:'move',payload:{x:1080,y:800,direction:'right',moving:true,seq:1}});
  await sendB.send({type:'broadcast',event:'move',payload:{x:960,y:700,direction:'up',moving:true,seq:1}});
  await until(()=>receivedA.length>0&&receivedB.length>0,'bidirectional movement');assert.equal(receivedA.at(-1)?.y,700);assert.equal(receivedB.at(-1)?.x,1080);
  checked('Real WebSocket Broadcast movement delivered A→B and B→A');
  await sendA.send({type:'broadcast',event:'action',payload:{action:'sword',x:1080,y:800,direction:'right',seq:2}});
  await until(()=>attacksB.length>0,'sword interaction');assert.equal(attacksB.at(-1)?.action,'sword');checked('Sword interaction delivered over the private channel');
  await sendA.send({type:'broadcast',event:'world',payload:{seq:3,enemies:[{id:'slime-0',x:480,y:460,health:70}]}});
  await sendA.send({type:'broadcast',event:'world',payload:{seq:4,enemies:[{id:'slime-0',x:481,y:460,health:44}]}});
  await until(()=>worldsB.length===2,'shared enemy snapshots');assert.equal(worldsB[1].enemies[0].health,44);checked('Host enemy position and shared health snapshots delivered over Realtime');
  const priorA=ownerMessagesA.length,priorB=ownerMessagesB.length;
  // B can read A's topic, but cannot publish into it.
  await readA.send({type:'broadcast',event:'move',payload:{x:999,y:999,direction:'up',moving:true,seq:999}}).catch(()=>{});
  await readB.send({type:'broadcast',event:'move',payload:{x:999,y:999,direction:'up',moving:true,seq:999}}).catch(()=>{});
  await pause(350);assert.equal(ownerMessagesA.length,priorA);assert.equal(ownerMessagesB.length,priorB);
  checked('A room member cannot publish on another player’s topic');
  await assert.rejects(subscribe(outsider,topicA),/CHANNEL_ERROR|permissions|Unauthorized|not authorized/i);checked('Unauthenticated outsider denied access to the private room');
  const publicChannel=outsider.channel(`public-bypass-${room.id}`);channels.push([outsider,publicChannel]);
  await assert.rejects(new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('public join timeout')),6000);publicChannel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(t);resolve();}if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){clearTimeout(t);reject(new Error(status));}});}),/CHANNEL_ERROR/);
  checked('Project rejects public-channel bypass');
  for(let i=0;i<2;i++){
    const {error:writeError}=await clients[i].from('characters').update({level:99,coins:9999,inventory:{feron:9999}}).eq('user_id',users[i].id);assert.ok(writeError);
    const {data:other}=await clients[i].from('characters').select('*').eq('user_id',users[1-i].id);assert.deepEqual(other,[]);
  }
  checked('Own progression writes rejected; other users’ private character data unreadable');
  await clients[1].removeChannel(sendB);await until(()=>Object.values(readA.presenceState()).flat().length===0,'disconnect Presence cleanup');
  checked('Disconnect removes peer Presence');
  const restored=await subscribe(clients[1],topicB);await restored.track({connected_at:new Date().toISOString()});
  await until(()=>Object.values(readA.presenceState()).flat().length>0,'reconnect Presence');checked('Independent session reconnect restores Presence');
  const {data:snapshot}=await clients[1].from('characters').select('*').eq('user_id',users[1].id).single();
  await clients[1].auth.signOut({scope:'local'});const {error:loginError}=await clients[1].auth.signInWithPassword({email:credentials[1][1],password:credentials[1][2]});if(loginError)throw loginError;
  const {data:reloaded}=await clients[1].from('characters').select('*').eq('user_id',users[1].id).single();assert.deepEqual(reloaded,snapshot);
  checked('Character, level, XP, equipment and inventory recover unchanged after sign out / sign in');
  report.completed=true;
}finally{
  for(const[client,channel]of channels)await client.removeChannel(channel);
  if(room)for(const client of clients)await client.rpc('leave_room',{p_room:room.id});
  for(const client of [...clients,outsider]){await client.auth.signOut({scope:'local'});client.realtime.disconnect();}
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/online-verification.json',JSON.stringify(report,null,2));
}
console.log('Real Supabase two-session verification completed.');
process.exit(0);
