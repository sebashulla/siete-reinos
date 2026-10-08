import Phaser from 'phaser';
import type { User } from '@supabase/supabase-js';
import './style.css';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene, type Hud } from './scenes/GameScene';
import { PersistenceService } from './services/PersistenceService';
import { starterCharacter } from './data/character';
import { MultiplayerService } from './services/MultiplayerService';
import { configured, friendlyError, requireSupabase, supabase } from './services/supabase';
import { ITEMS, SKILLS, SPECIALIZATIONS, statsFor } from './data/definitions';
import { PALETTES, type Affinity, type Appearance, type Character, type Member, type Room } from './data/types';
import { requiredXp, awardXp } from './systems/ProgressionSystem';
import { icon, escapeHtml as esc } from './ui/icons';
import { emit, listen, uiState } from './ui/events';

const persistence=new PersistenceService(),multiplayer=new MultiplayerService();
let user:User|null=null,character:Character|null=null,playing=false,online=false,room:Room|null=null;
let busy=false,registering=false,toastTimer:ReturnType<typeof setTimeout>,authGeneration=0;
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
  <aside class="rail" aria-label="Navegación principal">
    <a class="brand-mark" href="#" aria-label="Los Siete Reinos, inicio">${icon('crown',30)}</a>
    <div class="rail-divider"></div>
    <button class="rail-button active" data-nav="adventure" aria-label="Aventura" title="Aventura">${icon('compass')}<span>Aventura</span></button>
    <button class="rail-button" data-nav="character" aria-label="Personaje" title="Personaje">${icon('character')}<span>Personaje</span></button>
    <button class="rail-button" data-nav="guide" aria-label="Guía" title="Guía">${icon('book')}<span>Guía</span></button>
    <div class="rail-bottom"><button class="rail-button" data-nav="settings" aria-label="Ajustes" title="Ajustes">${icon('settings')}<span>Ajustes</span></button><small>WEB EDITION<br>v0.1</small></div>
  </aside>
  <main class="shell">
    <header class="topbar"><div class="wordmark">LOS SIETE REINOS <span>UN MUNDO POR DESCUBRIR</span></div><div class="topbar-actions"><span class="server-status"><i></i> VALDORIA · ${configured?'SUPABASE CONFIGURADO':'MODO LOCAL'}</span><button id="account-button" class="account-button">${icon('character',18)}<span>Entrar / Registrarse</span></button></div></header>
    <section class="page-heading"><div><p class="eyebrow">TU PRÓXIMA HISTORIA COMIENZA AQUÍ</p><h1>El reino te espera<span>.</span></h1></div><p class="heading-note">Un camino. Siete reinos.<br>Una aventura para compartir.</p></section>
    <section class="world-frame" aria-label="Mapa de Valdoria">
      <div id="game"></div><div class="map-vignette"></div>
      <div id="menu-layer">
        <div class="map-label"><i></i> VALDORIA <span>REGIÓN INICIAL</span></div>
        <div class="hero-card"><div class="ornament">✦ <span>EL PRIMER CAPÍTULO</span> ✦</div><h2>Una nueva<br>aventura.</h2><p>Más allá de las murallas, el bosque guarda secretos. Elige tu camino y explora junto a quienes te acompañan.</p><button id="start-button" class="primary large">Comenzar aventura ${icon('arrow',20)}</button><button id="customize-button" class="text-button">${icon('character',17)} Personalizar personaje</button><div class="hero-footnote">${icon('online',16)} SALAS PRIVADAS · HASTA 4 JUGADORES</div></div>
        <div class="preview-caption">MAPA DEL JUEGO · VISTA ILUSTRATIVA</div><div class="map-coordinate">VALDORIA<br><span>07° N · 14° E</span></div>
      </div>
      <div id="hud-layer" hidden>
        <div class="player-hud"><div class="portrait" id="hud-portrait"></div><div class="hud-vitals"><div class="hud-name"><b id="hud-name"></b><span id="hud-level"></span></div><div class="meter health"><div id="health-fill"></div><span id="health-text"></span></div><div class="meter mana"><div id="mana-fill"></div><span id="mana-text"></span></div><div class="xp-meter"><div id="xp-fill"></div></div></div></div>
        <div class="area-hud"><span>LOS SIETE REINOS</span><b id="area-name">Pueblo de Valdoria</b></div>
        <div class="room-hud"><div id="connection-status">AVENTURA LOCAL</div><button id="room-code" title="Copiar código de sala" hidden></button><span id="player-count"></span><button id="leave-button" aria-label="Volver al lobby" title="Volver al lobby">${icon('exit',18)}</button></div>
        <div id="minimap" class="minimap"><div class="minimap-title">${icon('map',13)} VALDORIA <kbd>M</kbd></div><svg viewBox="0 0 192 144" role="img" aria-label="Minimapa de Valdoria"><rect width="192" height="144" fill="#3b543a"/><path d="M13 80H173M96 39V134M96 42h55" stroke="#a6966f" stroke-width="7"/><rect x="70" y="54" width="58" height="32" fill="#7c8468"/><rect x="71" y="58" width="12" height="9" fill="#c4ad7f"/><rect x="107" y="58" width="12" height="9" fill="#c4ad7f"/><ellipse cx="32" cy="117" rx="24" ry="16" fill="#4a7b74"/><path d="m139 34 9-12 12 12Z" fill="#91a489"/><circle cx="96" cy="117" r="11" stroke="#a6aa87" fill="none"/><circle id="minimap-player" cx="96" cy="80" r="2.4" fill="#fff1c1"/></svg><small>WASD para explorar</small></div>
        <div class="quest-hud" id="quest-hud"><span class="eyebrow">UNA TIERRA POR EXPLORAR</span><b>Los caminos de Valdoria</b><p>Habla con Elías en el pueblo.<br>Encuentra las minas al noreste.</p></div>
        <div class="interaction-hud"><div id="interaction-hint"></div><div id="mining-bar" hidden><span>Extrayendo mineral…</span><div><i></i></div></div></div>
        <div class="hotbar"><button data-action="sword" title="Espada · Espacio">${icon('sword',26)}<kbd>ESPACIO</kbd></button><button data-action="magic" title="Magia · Q">${icon('magic',26)}<kbd>Q</kbd></button><button data-action="dodge" title="Esquiva · Shift" id="dodge-button">${icon('shield',26)}<kbd>SHIFT</kbd></button><span></span><button data-panel="inventory" title="Inventario · I">${icon('gem',24)}<kbd>I</kbd></button><button data-panel="skills" title="Habilidades · K">${icon('book',24)}<kbd>K</kbd></button><button data-panel="guide" title="Controles">${icon('compass',24)}<kbd>?</kbd></button></div>
        <div class="game-bottom-note" id="game-note"></div>
      </div>
    </section>
    <section class="discovery-grid" id="discovery"><article><span class="feature-icon">${icon('compass',23)}</span><div><p class="eyebrow">EXPLORA</p><h3>Un reino con vida</h3><p>Senderos, bosques y minas.<br>Cada rincón tiene una historia.</p></div><span class="feature-number">01</span></article><article><span class="feature-icon">${icon('sword',23)}</span><div><p class="eyebrow">ELIGE TU CAMINO</p><h3>Acero o magia</h3><p>Dos afinidades, tu propio estilo.<br>El poder comienza contigo.</p></div><span class="feature-number">02</span></article><article><span class="feature-icon">${icon('online',23)}</span><div><p class="eyebrow">COMPARTE</p><h3>Mejor en compañía</h3><p>Crea una sala, comparte el código<br>y recorre Valdoria con amigos.</p></div><span class="feature-number">03</span></article></section>
    <footer class="site-footer"><span>HECHO PARA EXPLORAR JUNTOS</span><span>✦</span><span>LOS SIETE REINOS · PROTOTIPO JUGABLE</span></footer>
  </main>
  <div id="modal-root"></div><div id="toast" role="status" aria-live="polite"></div>`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const game=new Phaser.Game({type:Phaser.AUTO,parent:'game',backgroundColor:'#344e37',pixelArt:true,roundPixels:true,
  scale:{mode:Phaser.Scale.RESIZE,width:el('game').clientWidth,height:el('game').clientHeight},
  physics:{default:'arcade',arcade:{debug:false}},scene:[LobbyScene,GameScene],render:{antialias:false},
});
const scene=()=>game.scene.getScene('GameScene') as GameScene;
el<HTMLButtonElement>('start-button').disabled=true;el<HTMLButtonElement>('account-button').disabled=true;
function toast(message:string):void{el('toast').textContent=message;el('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el('toast').classList.remove('show'),5000);}
function closeModal():void{el('modal-root').innerHTML='';uiState.modal=false;game.canvas.focus();}
function modal(title:string,subtitle:string,body:string,wide=false):void{
  const previousFocus=document.activeElement as HTMLElement|null;
  uiState.modal=true;
  el('modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><button class="close-button" aria-label="Cerrar">${icon('close',20)}</button><p class="eyebrow">LOS SIETE REINOS</p><h2>${title}</h2><p class="modal-subtitle">${subtitle}</p>${body}<p class="form-message" role="status" id="form-message"></p></section></div>`;
  el('modal-root').querySelector('.close-button')!.addEventListener('click',()=>{closeModal();previousFocus?.focus();});
  el('modal-root').querySelector('.modal-backdrop')!.addEventListener('click',e=>{if(e.target===e.currentTarget&&!busy)closeModal();});
  el('modal-root').querySelector<HTMLElement>('input,button')?.focus();
}
async function operation(fn:()=>Promise<void>):Promise<void>{
  if(busy)return;busy=true;el('modal-root').querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach(b=>b.disabled=true);
  try{await fn();}catch(error){const message=friendlyError(error);if(el('form-message'))el('form-message').textContent=message;else toast(message);}
  finally{busy=false;el('modal-root').querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach(b=>b.disabled=false);}
}
function portraitMarkup(c:Pick<Character,'affinity'|'appearance'>):string{return `<div class="sprite-preview" style="background-image:url('/assets/${c.affinity}-${c.appearance.palette}-${c.appearance.skin}.png')"></div>`;}
function appearanceFields(appearance:Appearance={palette:'forest',skin:'warm'}):string {
  return `<label class="field-label">Color de vestimenta</label><div class="palette-options">${PALETTES.map(p=>`<label class="palette ${p}"><input type="radio" name="palette" value="${p}" ${p===appearance.palette?'checked':''}/><span></span><small>${{forest:'Bosque',ember:'Ámbar',violet:'Arcano'}[p]}</small></label>`).join('')}</div><label class="field-label" for="skin">Tono de piel</label><select id="skin" name="skin"><option value="warm" ${appearance.skin==='warm'?'selected':''}>Cálido</option><option value="deep" ${appearance.skin==='deep'?'selected':''}>Oscuro</option><option value="light" ${appearance.skin==='light'?'selected':''}>Claro</option></select>`;
}
function affinityFields(selected:Affinity='swordsman'):string{return `<div class="affinity-options">${(['swordsman','mage'] as Affinity[]).map(a=>`<label class="affinity-option"><input type="radio" name="affinity" value="${a}" ${a===selected?'checked':''}/>${portraitMarkup({affinity:a,appearance:{palette:a==='mage'?'violet':'forest',skin:'warm'}})}<b>${SPECIALIZATIONS[a].name}</b><small>${a==='mage'?'Túnica y bastón':'Armadura y espada'}</small></label>`).join('')}</div>`;}
function readAppearance(form:HTMLFormElement):Appearance{const data=new FormData(form);return {palette:data.get('palette') as Appearance['palette'],skin:data.get('skin') as Appearance['skin']};}
function showAuth(register=false):void{
  if(!configured){toast('Supabase no está configurado. Puedes jugar una aventura local.');return;}
  registering=register;
  modal(register?'Escribe tu historia.':'Bienvenido de vuelta.',register?'Crea una cuenta y el personaje que te acompañará.':'Entra para recuperar tu personaje y jugar con amigos.',`
    <div class="auth-tabs"><button id="login-tab" class="${!register?'selected':''}">Iniciar sesión</button><button id="register-tab" class="${register?'selected':''}">Registrarse</button></div>
    <form id="auth-form"><label for="email">Correo electrónico</label><input id="email" name="email" type="email" autocomplete="email" placeholder="tu@correo.com" required/><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="8" maxlength="128" placeholder="Al menos 8 caracteres" required/>
    ${register?`<label for="name">Nombre único del personaje</label><input id="name" name="name" pattern="[A-Za-z0-9_]{3,18}" minlength="3" maxlength="18" placeholder="Tu nombre en Valdoria" required/><small class="field-help">3–18 letras, números o guion bajo.</small>${affinityFields()}${appearanceFields()}`:''}
    <button type="submit" class="primary full">${register?'Crear cuenta':'Entrar al reino'} ${icon('arrow',18)}</button></form>
    <p class="form-footnote">${register?'Recibirás un correo para confirmar tu cuenta.':'Tu progreso está vinculado a tu cuenta de Supabase.'}</p>`,register);
  el('login-tab').onclick=()=>showAuth(false);el('register-tab').onclick=()=>showAuth(true);
  el('auth-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;void operation(async()=>{
    const data=new FormData(form),email=String(data.get('email')).trim(),password=String(data.get('password'));
    if(registering){
      const pending={name:String(data.get('name')),affinity:data.get('affinity'),appearance:readAppearance(form)};
      const {data:auth,error}=await requireSupabase().auth.signUp({email,password,options:{emailRedirectTo:location.origin,data:{pending_character:pending}}});
      if(error)throw error;
      if(!auth.session){el('form-message').classList.add('success');el('form-message').textContent='Revisa tu correo y confirma tu cuenta. Después inicia sesión aquí.';return;}
      user=auth.user;character=await persistence.create(pending.name,pending.affinity as Affinity,pending.appearance);updateAccount();showLobby();
    }else{
      const {data:auth,error}=await requireSupabase().auth.signInWithPassword({email,password});if(error)throw error;
      user=auth.user;await loadAccount();if(character)showLobby();else showCharacterCreation(true);
    }
  });};
}
async function loadAccount():Promise<void>{
  character=await persistence.load();
  if(!character&&user?.user_metadata.pending_character){
    const p=user.user_metadata.pending_character as {name:string;affinity:Affinity;appearance:Appearance};
    try{character=await persistence.create(p.name,p.affinity,p.appearance);}catch(error){toast(friendlyError(error));}
  }
  updateAccount();
}
function updateAccount():void{el('account-button').innerHTML=`${icon('character',18)}<span>${esc(user?(character?.name??'Mi cuenta'):'Entrar / Registrarse')}</span>`;}
function showCharacterCreation(account:boolean):void{
  const saved=!account?persistence.loadLocal():null;
  if(saved){character=saved;showLobby();return;}
  modal('Tu leyenda, tu camino.',account?'Tu personaje se guardará en tu cuenta. La afinidad inicial no bloquea otras disciplinas.':'Aventura local: el progreso se guarda en este navegador.',`
    <form id="character-form"><label for="name">Nombre del personaje</label><input id="name" name="name" minlength="3" maxlength="18" pattern="[A-Za-z0-9_]{3,18}" placeholder="Aventurero" required/>${affinityFields()}${appearanceFields()}<button type="submit" class="primary full">Crear personaje ${icon('arrow',18)}</button></form>`,true);
  el('character-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;void operation(async()=>{
    const data=new FormData(form),name=String(data.get('name')).trim(),affinity=data.get('affinity') as Affinity,appearance=readAppearance(form);
    character=account?await persistence.create(name,affinity,appearance):starterCharacter(name,affinity,appearance);
    if(!account)persistence.saveLocal(character);updateAccount();showLobby();
  });};
}
function showStart():void{
  if(user){if(character)showLobby();else showCharacterCreation(true);return;}
  modal('Elige tu aventura.', 'Valdoria está lista. Tú decides cómo entrar.',`
    <button class="choice-card" id="online-choice">${icon('online',28)}<div><b>Jugar con amigos</b><p>Regístrate o inicia sesión. Crea una sala privada y comparte su código.</p></div>${icon('chevron',18)}</button>
    <button class="choice-card" id="local-choice">${icon('compass',28)}<div><b>Aventura local</b><p>Exploración, combate y minería. Progreso guardado en este navegador.</p></div>${icon('chevron',18)}</button>`);
  el('online-choice').onclick=()=>showAuth(false);el('local-choice').onclick=()=>{online=false;showCharacterCreation(false);};
}
function showLobby():void{
  if(!character)return;
  const account=character.user_id!=='local';
  modal('El fuego reúne a los viajeros.',account?'Crea una sala privada o únete con el código de un amigo.':'Tu aventura local está lista. Puedes explorar, combatir y reunir minerales.',`
    <div class="character-summary">${portraitMarkup(character)}<div><h3>${esc(character.name)}</h3><p>${SPECIALIZATIONS[character.affinity].name} · Nivel ${character.level}</p><small>${account?'PERSONAJE GUARDADO EN SUPABASE':'PERSONAJE LOCAL · ESTE NAVEGADOR'}</small></div>${icon('shield',25)}</div>
    ${account?`<div class="lobby-section"><label class="field-label">AVENTURA CON AMIGOS</label><form id="create-room-form"><button type="submit" class="primary full">${icon('online',18)} Crear sala privada</button></form><div class="or-divider"><span>o únete a una sala</span></div><form id="join-room-form" class="join-form"><input name="code" aria-label="Código de sala" placeholder="CÓDIGO DE 12 CARACTERES" pattern="[A-Fa-f0-9]{12}" maxlength="12" required/><button type="submit" class="secondary">Unirme ${icon('arrow',17)}</button></form><form id="resume-room-form" hidden><button class="secondary full" type="submit">Volver a mi sala</button><button id="abandon-room" type="button" class="text-button full">Abandonar la sala anterior</button></form><p class="form-footnote">En línea: movimiento, presencia y animaciones compartidas. Combate y minería de práctica; recompensas pendientes del backend.</p></div>`:''}
    <button id="play-local" class="${account?'text-button':'primary'} full">${icon('compass',18)} ${account?'Explorar una aventura local separada':'Entrar en Valdoria'} ${icon('arrow',18)}</button>`);
  el('play-local').onclick=()=>{
    if(account){character=persistence.loadLocal()??starterCharacter(character!.name,character!.affinity,character!.appearance);persistence.saveLocal(character);}
    void startGame(false);
  };
  if(account){
    el('create-room-form').onsubmit=e=>{e.preventDefault();void operation(async()=>{room=await multiplayer.createRoom();await startGame(true);});};
    el('join-room-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;void operation(async()=>{room=await multiplayer.joinRoom(String(new FormData(form).get('code')));await startGame(true);});};
    void multiplayer.currentRoom().then(existing=>{
      if(existing&&el('resume-room-form')){el('resume-room-form').hidden=false;el('resume-room-form').onsubmit=e=>{e.preventDefault();room=existing;void operation(()=>startGame(true));};el('abandon-room').onclick=()=>void operation(async()=>{await multiplayer.leave(existing);room=null;showLobby();});}
    }).catch(error=>toast(friendlyError(error)));
  }
}
async function startGame(isOnline:boolean):Promise<void>{
  if(!character||isOnline&&!room)return;
  closeModal();online=isOnline;playing=true;app.classList.add('playing');el('menu-layer').hidden=true;el('hud-layer').hidden=false;
  el('hud-name').textContent=character.name;el('hud-portrait').innerHTML=portraitMarkup(character);
  el('room-code').hidden=!isOnline;el('room-code').textContent=room?.code??'';el('player-count').textContent=isOnline?'1 / 4':'';
  el('connection-status').textContent=isOnline?'CONECTANDO':'AVENTURA LOCAL';
  el('game-note').textContent=isOnline?'Combate cooperativo de práctica · Sin recompensas persistentes':'Progreso local guardado en este navegador';
  game.scene.stop('LobbyScene');game.scene.start('GameScene',{character,online:isOnline,multiplayer:isOnline?multiplayer:undefined});
  game.canvas.tabIndex=0;game.canvas.setAttribute('aria-label','Mapa de Valdoria. WASD para moverte, Espacio espada, Q magia, E interactuar.');game.canvas.focus();
  if(isOnline)try{
    await multiplayer.connect(room!,character.user_id,{
      position:(id,p)=>{scene().remotePosition(id,p);if(el('qa-remote'))el('qa-remote').textContent=`RECIBIDO · ${Math.round(p.x)}, ${Math.round(p.y)} · ${p.direction}`;},interaction:(id,a)=>scene().remoteInteraction(id,a),
      members:(members,active)=>{scene().setMembers(members,active);updateMembers(members,active);},
      world:snapshot=>scene().applyWorld(snapshot),host:id=>scene().setHost(id),
      lostAccess:message=>{void returnToMenu(false).then(()=>toast(message));},
      status:status=>{el('connection-status').textContent=status.toUpperCase();el('connection-status').classList.toggle('connected',status==='En línea');},
    });
    toast('Sala conectada. Comparte el código con tu compañero.');
  }catch(error){await returnToMenu(false);throw error;}
}
function updateMembers(members:Member[],active:Set<string>):void{
  el('player-count').textContent=`${members.filter(m=>active.has(m.user_id)).length} / 4`;
}
async function returnToMenu(leave=true):Promise<void>{
  if(!online&&character)persistence.saveLocal(character);
  if(online&&room){if(leave)await multiplayer.leave(room);else await multiplayer.disconnect();}
  room=null;playing=false;online=false;uiState.modal=false;
  game.scene.stop('GameScene');game.scene.start('LobbyScene');app.classList.remove('playing');el('menu-layer').hidden=false;el('hud-layer').hidden=true;closeModal();
  if(user)await loadAccount();else character=persistence.loadLocal();
}
function showCustomization():void{
  if(!character){if(user)showCharacterCreation(true);else showCharacterCreation(false);return;}
  if(playing&&online){toast('Vuelve al lobby para cambiar tu apariencia.');return;}
  modal('Hecho a tu medida.',`${esc(character.name)} · ${SPECIALIZATIONS[character.affinity].name}`,`
    <form id="customization-form"><div id="customization-preview" class="large-portrait">${portraitMarkup(character)}</div>${appearanceFields(character.appearance)}<button type="submit" class="primary full">Guardar apariencia ${icon('arrow',18)}</button></form>`);
  const form=el<HTMLFormElement>('customization-form');
  form.onchange=()=>{el('customization-preview').innerHTML=portraitMarkup({affinity:character!.affinity,appearance:readAppearance(form)});};
  form.onsubmit=e=>{e.preventDefault();void operation(async()=>{
    const appearance=readAppearance(form);
    if(character!.user_id==='local'){character!.appearance=appearance;persistence.saveLocal(character!);}else character=await persistence.customize(appearance);
    if(playing){game.scene.stop('GameScene');game.scene.start('GameScene',{character,online:false});el('hud-portrait').innerHTML=portraitMarkup(character!);}
    closeModal();toast('Apariencia guardada.');
  });};
}
function showInventory():void{
  if(!character)return;
  modal('Lo que llevas contigo.',online?'Inventario persistente. Las recompensas en línea requieren un backend verificador.':'Recursos y equipo de tu aventura local.',`
    <div class="inventory-stats"><b>Nivel ${character.level}</b><span>${character.xp} / ${requiredXp(character.level)} EXP</span><span>${character.coins} monedas</span></div>
    <div class="equipment">${icon('sword',20)} ${ITEMS[character.equipment.weapon]?.name??esc(character.equipment.weapon)}<br>${icon('shield',20)} ${ITEMS[character.equipment.armor]?.name??esc(character.equipment.armor)}</div>
    <div class="inventory-grid">${Object.entries(character.inventory).map(([id,count])=>`<div class="inventory-item"><span>${ITEMS[id]?.icon??'◆'}</span><b>${ITEMS[id]?.name??esc(id)}</b><small>× ${count}</small></div>`).join('')}</div>
    ${!online&&playing?'<button id="potion-button" class="secondary full">Beber poción · +45 salud</button>':''}`);
  if(el('potion-button'))el('potion-button').onclick=()=>{toast(scene().combat.drinkPotion()?'Salud recuperada.':'Necesitas una poción y tener salud por recuperar.');showInventory();};
}
function showSkills():void{
  if(!character)return;const stats=statsFor(character);
  modal('El poder de tu camino.',`${SPECIALIZATIONS[character.affinity].name} · Ambas disciplinas están abiertas.`,`
    <div class="inventory-stats"><span>${stats.physical} daño físico</span><span>${stats.magical} daño mágico</span></div>
    ${SKILLS.map(s=>`<div class="skill-row ${character!.skills.includes(s.id)?'':'locked'}">${icon(s.id==='magic'?'magic':'sword',24)}<div><b>${s.name}</b><p>${s.description}</p></div><kbd>${character!.skills.includes(s.id)?s.key:'NIVEL 3'}</kbd></div>`).join('')}`);
}
function showMerchant():void{
  modal('Elías, el comerciante.', '«Un buen viaje empieza con algo en la mochila.»',online?'<p class="dialogue">Bienvenido a Valdoria. Las minas están al noreste y el bosque al oeste. El comercio en línea abrirá cuando las recompensas puedan verificarse en el servidor.</p>':'<p class="dialogue">Los limos del bosque dejan monedas. Puedo darte una poción por 10 monedas para continuar tu viaje.</p><button id="buy-potion" class="primary full">Comprar poción · 10 monedas</button>');
  if(el('buy-potion'))el('buy-potion').onclick=()=>{if(character!.coins<10){toast('Necesitas 10 monedas. Derrota enemigos en el bosque.');return;}character!.coins-=10;character!.inventory.pocion=(character!.inventory.pocion??0)+1;persistence.saveLocal(character!);toast('Has comprado una poción.');};
}
function showForge():void{
  const amount=Number(localStorage.getItem('siete-reinos:forge')??0)||0;
  modal('La herrería de Valdoria.',online?'Proyecto comunitario pendiente del backend autoritativo.':'Ayuda a reconstruir la herrería en tu aventura local.',online?'<p class="dialogue">Las contribuciones compartidas y las mejoras persistentes necesitan validación del servidor. Por ahora, puedes explorar y practicar la extracción con tu compañero.</p>':`<p class="dialogue">Reunimos feron para devolver el fuego a esta fragua. Cada aporte acerca al pueblo a una nueva era.</p><div class="forge-progress"><span>${Math.min(10,amount)} / 10 feron</span><progress max="10" value="${Math.min(10,amount)}"></progress></div>${amount<10?'<button id="contribute" class="primary full">Contribuir 1 feron</button>':'<p class="form-message success">¡La herrería está reconstruida!</p><button id="forge-upgrade" class="primary full">Entrenar con el herrero · 5 feron / 40 EXP</button>'}`);
  if(el('contribute'))el('contribute').onclick=()=>{if((character!.inventory.feron??0)<1){toast('Extrae feron en las minas al noreste.');return;}character!.inventory.feron--;localStorage.setItem('siete-reinos:forge',String(amount+1));persistence.saveLocal(character!);if(amount+1>=10&&playing)scene().rebuildForge();showForge();};
  if(el('forge-upgrade'))el('forge-upgrade').onclick=()=>{if((character!.inventory.feron??0)<5){toast('Necesitas 5 feron.');return;}character!.inventory.feron-=5;const levels=awardXp(character!,40);persistence.saveLocal(character!);toast(levels?`¡Nivel ${character!.level}!`:'+40 experiencia de entrenamiento');};
}
function showGuide():void{
  modal('Tu guía de Valdoria.', 'Los caminos se descubren andando.',`
    <div class="controls-grid">${[['W A S D','Moverse'],['ESPACIO / CLIC','Espada'],['Q','Proyectil mágico'],['SHIFT','Esquivar'],['E','Hablar / extraer'],['I','Inventario'],['K','Habilidades'],['M','Minimapa'],['ESC','Menú']].map(([key,label])=>`<kbd>${key}</kbd><span>${label}</span>`).join('')}</div><p class="dialogue">El pueblo está en el centro; el bosque y sus enemigos, al oeste; las minas de feron y auralita, al noreste. La afinidad inicial mejora una disciplina, pero ambos personajes pueden usar espada y magia.</p><p class="form-footnote">En línea, el creador de la sala coordina los enemigos de práctica. Si se desconecta, ese combate espera su regreso. Recompensas, economía y Conquista compartida requieren un backend autoritativo.</p>`,true);
}
function showSettings():void{
  modal('A tu ritmo.', 'Ajustes de interfaz guardados en este navegador.',`<label class="setting-row">Mostrar minimapa<input id="minimap-toggle" type="checkbox" ${uiState.minimap?'checked':''}/></label><label class="setting-row">Mostrar números de daño<input id="damage-toggle" type="checkbox" ${uiState.damageNumbers?'checked':''}/></label><p class="form-footnote">El juego está diseñado para escritorio, con teclado y ratón. En línea, abrir el menú detiene a tu personaje; los demás siguen jugando.</p>`);
  el<HTMLInputElement>('minimap-toggle').onchange=e=>{uiState.minimap=(e.target as HTMLInputElement).checked;el('minimap').hidden=!uiState.minimap;saveSettings();};
  el<HTMLInputElement>('damage-toggle').onchange=e=>{uiState.damageNumbers=(e.target as HTMLInputElement).checked;saveSettings();};
}
function saveSettings():void{localStorage.setItem('siete-reinos:settings',JSON.stringify({minimap:uiState.minimap,damageNumbers:uiState.damageNumbers}));}
function showPause():void{
  if(uiState.modal){closeModal();return;}
  modal(online?'Un respiro en el camino.':'Aventura en pausa.',online?'Tu compañero puede seguir explorando.':'Tu progreso se guarda automáticamente.',`<button id="continue-button" class="primary full">Continuar aventura ${icon('arrow',18)}</button><button id="pause-settings" class="secondary full">Ajustes</button><button id="pause-leave" class="text-button full">Volver al menú principal</button>`);
  el('continue-button').onclick=closeModal;el('pause-settings').onclick=showSettings;el('pause-leave').onclick=()=>void operation(()=>returnToMenu());
}
el('start-button').onclick=showStart;el('customize-button').onclick=showCustomization;
el('account-button').onclick=()=>{
  if(!user){showAuth();return;}
  modal('Tu cuenta.',`${esc(character?.name??'Viajero')} · Supabase Auth`,`${!playing?'<button id="account-lobby" class="primary full">Jugar con amigos</button>':''}<button id="sign-out" class="secondary full">Cerrar sesión</button>`);
  if(el('account-lobby'))el('account-lobby').onclick=()=>void operation(async()=>{await loadAccount();if(character)showLobby();else showCharacterCreation(true);});
  el('sign-out').onclick=()=>void operation(async()=>{if(playing)await returnToMenu();const {error}=await requireSupabase().auth.signOut({scope:'local'});if(error)throw error;user=null;character=null;updateAccount();closeModal();toast('Sesión cerrada.');});
};
el('leave-button').onclick=()=>void operation(()=>returnToMenu());
el('room-code').onclick=()=>{if(room)void navigator.clipboard.writeText(room.code).then(()=>toast('Código copiado.')).catch(()=>toast(`Código de sala: ${room!.code}`));};
document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach(button=>button.onclick=()=>{
  const nav=button.dataset.nav;if(nav==='adventure'){if(playing)showPause();else showStart();}if(nav==='character')showCustomization();if(nav==='guide')showGuide();if(nav==='settings')showSettings();
});
document.querySelector('.brand-mark')!.addEventListener('click',e=>{e.preventDefault();if(playing)showPause();else closeModal();});
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>button.onclick=()=>{scene().action(button.dataset.action as 'sword'|'magic'|'dodge');game.canvas.focus();});
document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button=>button.onclick=()=>emit(button.dataset.panel!,undefined));
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&uiState.modal&&!busy){e.preventDefault();e.stopPropagation();closeModal();return;}
  if(e.key==='Tab'&&uiState.modal){const focusable=[...el('modal-root').querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]')];if(!focusable.length)return;
    const index=focusable.indexOf(document.activeElement as HTMLElement),next=e.shiftKey?(index-1+focusable.length)%focusable.length:(index+1)%focusable.length;e.preventDefault();focusable[next].focus();}
},true);
listen<string>('toast',toast);listen('inventory',showInventory);listen('skills',showSkills);listen('pause',showPause);listen('merchant',showMerchant);listen('forge',showForge);
listen('minimap',()=>{uiState.minimap=!uiState.minimap;el('minimap').hidden=!uiState.minimap;saveSettings();});
listen('save',()=>{if(!online&&character)persistence.saveLocal(character);});
listen<Hud>('hud',hud=>{
  if(!character)return;el('health-fill').style.width=`${hud.health/hud.maxHealth*100}%`;el('mana-fill').style.width=`${hud.mana/hud.maxMana*100}%`;
  el('health-text').textContent=`${Math.ceil(hud.health)} / ${hud.maxHealth}`;el('mana-text').textContent=`${Math.ceil(hud.mana)} / ${hud.maxMana}`;
  el('hud-level').textContent=`NV. ${character.level}`;el('xp-fill').style.width=`${character.xp/requiredXp(character.level)*100}%`;
  el('area-name').textContent=hud.area;el('interaction-hint').textContent=hud.hint;el('interaction-hint').hidden=!hud.hint;
  el('mining-bar').hidden=hud.mining===0;el('mining-bar').querySelector<HTMLElement>('i')!.style.width=`${hud.mining*100}%`;
  el('dodge-button').style.opacity=hud.dodge===1?'1':'0.45';el('minimap-player').setAttribute('cx',String(hud.x/10));el('minimap-player').setAttribute('cy',String(hud.y/10));
});
try{const saved=JSON.parse(localStorage.getItem('siete-reinos:settings')??'null');if(saved){uiState.minimap=saved.minimap!==false;uiState.damageNumbers=saved.damageNumbers!==false;}}catch{/* keep defaults */}
el('minimap').hidden=!uiState.minimap;
if(supabase){
  const {data,error}=await supabase.auth.getSession();
  if(error)toast(friendlyError(error));
  user=data.session?.user??null;if(user)try{await loadAccount();}catch(error){
    if(/session|JWT|token|user.*not found/i.test(friendlyError(error))){await supabase.auth.signOut({scope:'local'});user=null;character=null;updateAccount();toast('Tu sesión caducó. Vuelve a iniciar sesión.');}
    else toast(friendlyError(error));
  }
  supabase.auth.onAuthStateChange((event,session)=>{
    if(event==='TOKEN_REFRESHED'&&session)void supabase!.realtime.setAuth(session.access_token);
    if(event==='SIGNED_OUT'){const generation=++authGeneration;void Promise.resolve().then(async()=>{if(generation!==authGeneration)return;if(playing&&online)await returnToMenu(false);user=null;character=null;updateAccount();});}
  });
}
el<HTMLButtonElement>('start-button').disabled=false;el<HTMLButtonElement>('account-button').disabled=false;
window.addEventListener('pagehide',()=>{if(playing&&!online&&character)persistence.saveLocal(character);});
// Development-only controls allow repeatable UI tests without injecting browser state.
// They drive the real player physics and real MultiplayerService; no synthetic peers.
if(import.meta.env.DEV&&new URLSearchParams(location.search).get('qa')==='1'){
  const panel=document.createElement('div');panel.className='qa-panel';
  panel.innerHTML='<small>PRUEBAS · SOLO DESARROLLO</small><div><button data-walk="left">Mover oeste 1 s</button><button data-walk="right">Mover este 1 s</button><button data-walk="up">Mover norte 1 s</button><button data-walk="down">Mover sur 1 s</button></div><output id="qa-remote">Esperando movimiento remoto real</output><output id="qa-world"></output><output id="qa-position"></output><output id="qa-motion">MOVIMIENTO · DETENIDO</output>';
  document.body.append(panel);panel.querySelectorAll<HTMLButtonElement>('[data-walk]').forEach(button=>button.onclick=()=>{if(playing)scene().devWalk(button.dataset.walk as 'left'|'right'|'up'|'down');});
  listen<{id:string;health:number}[]>('qa-world',enemies=>{el('qa-world').textContent=`ENEMIGOS · ${enemies.map(e=>`${e.id}:${e.health}`).join(' · ')||'ninguno'}`;});
  listen<Hud>('hud',hud=>{el('qa-position').textContent=`LOCAL · ${Math.round(hud.x)}, ${Math.round(hud.y)}`;});
  listen<boolean>('qa-motion',moving=>{el('qa-motion').textContent=`MOVIMIENTO · ${moving?'EN CURSO':'DETENIDO'}`;});
}
