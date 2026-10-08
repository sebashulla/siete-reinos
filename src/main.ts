import Phaser from 'phaser';
import type { User } from '@supabase/supabase-js';
import './style.css';
import './game-layout.css';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene, type Hud } from './scenes/GameScene';
import { PersistenceService, ConsentRequired } from './services/PersistenceService';
import { starterCharacter } from './data/character';
import { MultiplayerService } from './services/MultiplayerService';
import { configured, friendlyError, requireSupabase, supabase } from './services/supabase';
import { ITEMS, SKILLS, SPECIALIZATIONS, statsFor, WORLD } from './data/definitions';
import { PALETTES, type Affinity, type Appearance, type Character, type Campaign } from './data/types';
import { requiredXp, awardXp } from './systems/ProgressionSystem';
import { icon, escapeHtml as esc } from './ui/icons';
import { emit, listen, uiState } from './ui/events';
import { territoryAt } from './shared/world';
import type { Snapshot } from './shared/protocol';

const persistence=new PersistenceService(),multiplayer=new MultiplayerService();
let user:User|null=null,character:Character|null=null,playing=false,online=false,campaign:Campaign|null=null,latest:Snapshot|null=null,legacy:Character|null=null;
let busy=false,registering=false,toastTimer:ReturnType<typeof setTimeout>,authGeneration=0;
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
  <aside class="rail" aria-label="Navegación principal">
    <a class="brand-mark" href="#" aria-label="Los Siete Reinos, inicio">${icon('crown',30)}</a>
    <div class="rail-divider"></div>
    <button class="rail-button active" data-nav="adventure" aria-label="Aventura" title="Aventura">${icon('compass')}<span>Aventura</span></button>
    <button class="rail-button" data-nav="character" aria-label="Personaje" title="Personaje">${icon('character')}<span>Personaje</span></button>
    <button class="rail-button" data-nav="guide" aria-label="Guía" title="Guía">${icon('book')}<span>Guía</span></button>
    <div class="rail-bottom"><button class="rail-button" data-nav="settings" aria-label="Ajustes" title="Ajustes">${icon('settings')}<span>Ajustes</span></button><small>WEB EDITION<br>v0.2</small></div>
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
        <div class="area-hud"><button id="laws-button" title="Leyes y causas · L">LEYES · L</button><b id="area-name">Pueblo de Valdoria</b></div>
        <div class="room-hud"><div id="connection-status">AVENTURA LOCAL</div><button id="room-code" title="Copiar código de sala" hidden></button><span id="player-count"></span><button id="leave-button" aria-label="Volver al lobby" title="Volver al lobby">${icon('exit',18)}</button></div>
        <div id="minimap" class="minimap"><div class="minimap-title">${icon('map',13)} VALDORIA <kbd>M</kbd></div><svg viewBox="0 0 192 144" role="img" aria-label="Mapa de los siete reinos"><rect x="0" y="0" width="64" height="96" fill="#476745" stroke="#c2c69a" stroke-width=".4"/><text x="37.333333333333336" y="56" font-size="5" fill="#f0e4b6" text-anchor="middle">ELDARA</text><rect x="64" y="48" width="64" height="48" fill="#778260" stroke="#c2c69a" stroke-width=".4"/><text x="96" y="74.66666666666666" font-size="5" fill="#f0e4b6" text-anchor="middle">VALDORIA</text><rect x="128" y="0" width="64" height="96" fill="#80785b" stroke="#c2c69a" stroke-width=".4"/><text x="145" y="56" font-size="5" fill="#f0e4b6" text-anchor="middle">DUNCREST</text><rect x="64" y="0" width="64" height="48" fill="#6e687e" stroke="#c2c69a" stroke-width=".4"/><text x="96" y="24" font-size="5" fill="#f0e4b6" text-anchor="middle">AURALIS</text><rect x="0" y="96" width="64" height="48" fill="#4b6867" stroke="#c2c69a" stroke-width=".4"/><text x="32" y="120" font-size="5" fill="#f0e4b6" text-anchor="middle">UMBRIA</text><rect x="64" y="96" width="64" height="48" fill="#95825c" stroke="#c2c69a" stroke-width=".4"/><text x="96" y="120" font-size="5" fill="#f0e4b6" text-anchor="middle">SAHARIM</text><rect x="128" y="96" width="64" height="48" fill="#706660" stroke="#c2c69a" stroke-width=".4"/><text x="160" y="120" font-size="5" fill="#f0e4b6" text-anchor="middle">CENIZA</text><circle id="minimap-player" r="2.4" fill="#fff1c1"/></svg><small>WASD para explorar</small></div>
        <div class="view-tools"><button id="fullscreen-button">Pantalla completa · F</button><button id="compact-button">Paneles</button><label>Zoom <input id="zoom-control" aria-label="Zoom del mapa" type="range" min="0.65" max="1.25" step="0.05" value="0.85"/></label></div><div class="quest-hud" id="quest-hud"><span class="eyebrow">UNA TIERRA POR EXPLORAR</span><b>Los caminos de Valdoria</b><p>Explora Éldara al oeste y Duncrest al este.<br>Consulta las leyes antes de actuar.</p></div>
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
      if(!auth.session){showRegistrationReceived(email);return;}
      user=auth.user;await loadAccount();await showCampaigns();
    }else{
      const {data:auth,error}=await requireSupabase().auth.signInWithPassword({email,password});if(error)throw error;
      user=auth.user;await loadAccount();await showCampaigns();
    }
  });};
}
function showRegistrationReceived(email:string):void{
 modal('Revisa tu correo.','Si el registro puede completarse, recibirás un correo con instrucciones para confirmar tu cuenta.', '<p class="dialogue">'+esc(email)+'</p><p class="form-footnote">Revisa también la carpeta de spam. Después confirma tu identidad para seleccionar una campaña.</p><button id="go-login" class="primary full">Iniciar sesión</button><button id="resend-email" class="secondary full" disabled>Reenviar en 60 s</button>');
 el('go-login').onclick=()=>showAuth(false);let remaining=60;
 const interval=setInterval(()=>{const button=el<HTMLButtonElement>('resend-email');if(!button){clearInterval(interval);return;}remaining--;button.textContent=remaining>0?'Reenviar en '+remaining+' s':'Reenviar confirmación';button.disabled=remaining>0;if(remaining<=0)clearInterval(interval);},1000);
 el('resend-email').onclick=()=>void operation(async()=>{const {error}=await requireSupabase().auth.resend({type:'signup',email,options:{emailRedirectTo:location.origin}});if(error)throw error;showRegistrationReceived(email);});
}
async function loadAccount():Promise<void>{legacy=await persistence.load();character=campaign?await persistence.load(campaign.id):legacy;updateAccount();}
async function showCampaigns():Promise<void>{
 const campaigns=await persistence.campaigns();legacy=await persistence.load();
 modal('Tu grupo, su mundo.','Cada campaña conserva su propio progreso, gobiernos y antecedentes.',
 (legacy?'<p class="dialogue">Tu personaje '+esc(legacy.name)+' está preservado y pendiente de asignación. Elige una campaña casual para vincularlo una sola vez.</p>':'')+
 campaigns.map(c=>'<button class="choice-card campaign-choice" data-campaign="'+c.id+'"><div><b>'+esc(c.name)+'</b><p>'+c.mode.toUpperCase()+' · mundo persistente</p></div></button>').join('')+
 '<form id="create-campaign"><label for="campaign-name">Nueva campaña</label><input id="campaign-name" name="name" required minlength="3" maxlength="60" placeholder="Aventuras con amigos"/><label for="campaign-mode">Reglas del mundo</label><select name="mode" id="campaign-mode"><option value="casual">Casual · sanciones reversibles</option><option value="hardcore">Hardcore · campaña de pruebas</option></select><button class="primary full" type="submit">Crear campaña</button></form><div class="or-divider"><span>Invitación de un amigo</span></div><form id="join-campaign" class="join-form"><input name="code" aria-label="Código de campaña" pattern="[A-Fa-f0-9]{12}" maxlength="12" placeholder="CÓDIGO DE 12 CARACTERES" required/><button class="secondary" type="submit">Unirme</button></form>');
 document.querySelectorAll<HTMLButtonElement>('.campaign-choice').forEach(button=>button.onclick=()=>void operation(()=>selectCampaign(campaigns.find(c=>c.id===button.dataset.campaign)!)));
 el('create-campaign').onsubmit=e=>{e.preventDefault();const f=e.currentTarget as HTMLFormElement,data=new FormData(f),name=String(data.get('name'));if(data.get('mode')==='hardcore'){showHardcoreConsent(1,()=>selectCampaignAfterCreate(name));return;}void operation(async()=>selectCampaign(await persistence.createCampaign(name)));};
 el('join-campaign').onsubmit=e=>{e.preventDefault();const code=String(new FormData(e.currentTarget as HTMLFormElement).get('code'));void operation(async()=>{try{await selectCampaign(await persistence.joinCampaign(code));}catch(error){if(error instanceof ConsentRequired){showHardcoreConsent(error.version,async()=>selectCampaign(await persistence.joinCampaign(code,error.version)));return;}throw error;}});};
}
async function selectCampaignAfterCreate(name:string):Promise<void>{await selectCampaign(await persistence.createCampaign(name,'hardcore',1));}
function showHardcoreConsent(version:number,accept:()=>Promise<void>):void{
 modal('Reglas hardcore · v'+version,'Cada integrante debe aceptar estas reglas personalmente antes de jugar.', '<p class="dialogue">El combate normal permite rescate y reaparición. Una sentencia judicial podría archivar definitivamente tu personaje, únicamente con pruebas verificadas, apelación resuelta, revisión humana del propietario y estando conectado. Una campaña casual nunca se convierte en hardcore y tu personaje heredado solo puede vincularse a una campaña casual.</p><p class="form-footnote">Las ejecuciones permanecen desactivadas en el servidor de producción de esta entrega. Se prueban únicamente en mundos aislados.</p><label class="setting-row">Acepto las reglas hardcore v'+version+'<input id="hardcore-consent" type="checkbox"/></label><button id="accept-hardcore" class="primary full" disabled>Aceptar y continuar</button>');
 el<HTMLInputElement>('hardcore-consent').onchange=e=>el<HTMLButtonElement>('accept-hardcore').disabled=!(e.target as HTMLInputElement).checked;
 el('accept-hardcore').onclick=()=>void operation(accept);
}
async function selectCampaign(selected:Campaign):Promise<void>{
 campaign=selected;character=await persistence.load(selected.id);
 if(character){showLobby();return;}
 if(legacy&&selected.mode==='casual'){
  modal('Conserva tu historia.','Esta vinculación es definitiva. Tus atributos y objetos permanecerán intactos.',
   '<p class="dialogue">Vincular '+esc(legacy.name)+' a '+esc(selected.name)+'. No se copiará a otras campañas.</p><button id="claim-character" class="primary full">Vincular personaje existente</button><button id="fresh-character" class="secondary full">Crear otro personaje para esta campaña</button>');
  el('claim-character').onclick=()=>void operation(async()=>{character=await persistence.claim(legacy!.id,selected.id);legacy=null;showLobby();});
  el('fresh-character').onclick=()=>showCharacterCreation(true);return;
 }
 showCharacterCreation(true);
}
function updateAccount():void{el('account-button').innerHTML=`${icon('character',18)}<span>${esc(user?(character?.name??'Mi cuenta'):'Entrar / Registrarse')}</span>`;}
function showCharacterCreation(account:boolean):void{
  const saved=!account?persistence.loadLocal():null;
  if(saved){character=saved;showLobby();return;}
  const pending=account?user?.user_metadata.pending_character:null;
  const affinity:Affinity=pending?.affinity==='mage'?'mage':'swordsman';
  const appearance:Appearance={palette:PALETTES.includes(pending?.appearance?.palette)?pending.appearance.palette:'forest',skin:['warm','deep','light'].includes(pending?.appearance?.skin)?pending.appearance.skin:'warm'};
  modal('Tu leyenda, tu camino.',account?'Tu personaje se guardará en esta campaña. La afinidad inicial no bloquea otras disciplinas.':'Aventura local: el progreso se guarda en este navegador.',`
    <form id="character-form"><label for="name">Nombre del personaje</label><input id="name" name="name" value="${esc(pending?.name??'')}" minlength="3" maxlength="18" pattern="[A-Za-z0-9_]{3,18}" placeholder="Aventurero" required/>${affinityFields(affinity)}${appearanceFields(appearance)}<button type="submit" class="primary full">Crear personaje ${icon('arrow',18)}</button></form>`,true);
  el('character-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;void operation(async()=>{
    const data=new FormData(form),name=String(data.get('name')).trim(),affinity=data.get('affinity') as Affinity,appearance=readAppearance(form);
    character=account?await persistence.create(name,affinity,appearance,campaign!.id):starterCharacter(name,affinity,appearance);
    if(!account)persistence.saveLocal(character);updateAccount();showLobby();
  });};
}
function showStart():void{
  if(user){void operation(showCampaigns);return;}
  modal('Elige tu aventura.', 'Valdoria está lista. Tú decides cómo entrar.',`
    <button class="choice-card" id="online-choice">${icon('online',28)}<div><b>Jugar con amigos</b><p>Regístrate o inicia sesión. Crea una sala privada y comparte su código.</p></div>${icon('chevron',18)}</button>
    <button class="choice-card" id="local-choice">${icon('compass',28)}<div><b>Aventura local</b><p>Exploración, combate y minería. Progreso guardado en este navegador.</p></div>${icon('chevron',18)}</button>`);
  el('online-choice').onclick=()=>showAuth(false);el('local-choice').onclick=()=>{online=false;showCharacterCreation(false);};
}
function showLobby():void{
 if(!character)return;const account=character.user_id!=='local';
 modal(account?esc(campaign!.name):'Aventura local.',account?'Campaña privada · progreso validado por el servidor':'El guardado local es independiente de tus campañas.',
 '<div class="character-summary">'+portraitMarkup(character)+'<div><h3>'+esc(character.name)+'</h3><p>'+SPECIALIZATIONS[character.affinity].name+' · Nivel '+character.level+'</p></div></div>'+
 (account?'<p class="dialogue">Invitación: <b>'+esc(campaign!.invite_code)+'</b></p><button id="enter-campaign" class="primary full">Entrar en la campaña</button><button id="other-campaigns" class="secondary full">Cambiar campaña</button>':'')+
 '<button id="play-local" class="text-button full">'+(account?'Explorar una aventura local separada':'Entrar en Valdoria')+'</button>');
 if(account){el('enter-campaign').onclick=()=>void operation(()=>startGame(true));el('other-campaigns').onclick=()=>void operation(showCampaigns);}
 el('play-local').onclick=()=>{if(account){character=persistence.loadLocal()??starterCharacter(character!.name,character!.affinity,character!.appearance);persistence.saveLocal(character);}void startGame(false);};
}
async function startGame(isOnline:boolean):Promise<void>{
 if(!character||isOnline&&!campaign)return;closeModal();online=isOnline;playing=true;latest=null;app.classList.add('playing');el('menu-layer').hidden=true;el('hud-layer').hidden=false;
 el('hud-name').textContent=character.name;el('hud-portrait').innerHTML=portraitMarkup(character);el('room-code').hidden=!isOnline;el('room-code').textContent=campaign?.invite_code??'';el('player-count').textContent=isOnline?'Conectando…':'';
 el('connection-status').textContent=isOnline?'DESPERTANDO SERVIDOR':'AVENTURA LOCAL';el('game-note').textContent=isOnline?'Campaña '+campaign!.name+' · CASUAL · servidor autoritativo':'Progreso local separado · justicia disponible en campañas';
 game.scene.stop('LobbyScene');game.scene.start('GameScene',{character,online:isOnline,multiplayer:isOnline?multiplayer:undefined});game.canvas.tabIndex=0;game.canvas.setAttribute('aria-label','Mapa. WASD movimiento, Espacio espada, Q magia, E interacción, L leyes.');game.canvas.focus();
 if(isOnline)try{await multiplayer.connect(campaign!,{world:state=>scene().applyState(state),lostAccess:message=>{void returnToMenu().then(()=>toast(message));},status:status=>{el('connection-status').textContent=status;el('connection-status').classList.toggle('connected',status==='En línea');}});toast('Campaña conectada. Comparte su invitación.');}catch(error){await returnToMenu();throw error;}
}
async function returnToMenu():Promise<void>{
 if(!online&&character)persistence.saveLocal(character);await multiplayer.disconnect();playing=false;online=false;latest=null;uiState.modal=false;
 game.scene.stop('GameScene');game.scene.start('LobbyScene');app.classList.remove('playing');el('menu-layer').hidden=false;el('hud-layer').hidden=true;closeModal();if(user)await loadAccount();else character=persistence.loadLocal();
}
function showCustomization():void{
  if(!character){if(user)void operation(showCampaigns);else showCharacterCreation(false);return;}
  if(playing&&online){toast('Vuelve al lobby para cambiar tu apariencia.');return;}
  modal('Hecho a tu medida.',`${esc(character.name)} · ${SPECIALIZATIONS[character.affinity].name}`,`
    <form id="customization-form"><div id="customization-preview" class="large-portrait">${portraitMarkup(character)}</div>${appearanceFields(character.appearance)}<button type="submit" class="primary full">Guardar apariencia ${icon('arrow',18)}</button></form>`);
  const form=el<HTMLFormElement>('customization-form');
  form.onchange=()=>{el('customization-preview').innerHTML=portraitMarkup({affinity:character!.affinity,appearance:readAppearance(form)});};
  form.onsubmit=e=>{e.preventDefault();void operation(async()=>{
    const appearance=readAppearance(form);
    if(character!.user_id==='local'){character!.appearance=appearance;persistence.saveLocal(character!);}else character=await persistence.customize(appearance,character!.id);
    if(playing){game.scene.stop('GameScene');game.scene.start('GameScene',{character,online:false});el('hud-portrait').innerHTML=portraitMarkup(character!);}
    closeModal();toast('Apariencia guardada.');
  });};
}
function showInventory():void{
  if(!character)return;
  modal('Lo que llevas contigo.',online?'Inventario de esta campaña · operaciones verificadas por el servidor.':'Recursos y equipo de tu aventura local.',`
    <div class="inventory-stats"><b>Nivel ${character.level}</b><span>${character.xp} / ${requiredXp(character.level)} EXP</span><span>${character.coins} monedas</span></div>
    <div class="equipment">${icon('sword',20)} ${ITEMS[character.equipment.weapon]?.name??esc(character.equipment.weapon)}<br>${icon('shield',20)} ${ITEMS[character.equipment.armor]?.name??esc(character.equipment.armor)}</div>
    <div class="inventory-grid">${Object.entries(character.inventory).map(([id,count])=>`<div class="inventory-item"><span>${ITEMS[id]?.icon??'◆'}</span><b>${ITEMS[id]?.name??esc(id)}</b><small>× ${count}</small></div>`).join('')}</div>
    ${playing?'<button id="potion-button" class="secondary full">Beber poción · +45 salud</button>':''}`);
  if(el('potion-button'))el('potion-button').onclick=()=>{if(online){scene().command('potion');closeModal();}else{toast(scene().combat.drinkPotion()?'Salud recuperada.':'Necesitas una poción y tener salud por recuperar.');showInventory();}};
}
function showSkills():void{
  if(!character)return;const stats=statsFor(character);
  modal('El poder de tu camino.',`${SPECIALIZATIONS[character.affinity].name} · Ambas disciplinas están abiertas.`,`
    <div class="inventory-stats"><span>${stats.physical} daño físico</span><span>${stats.magical} daño mágico</span></div>
    ${SKILLS.map(s=>`<div class="skill-row ${character!.skills.includes(s.id)?'':'locked'}">${icon(s.id==='magic'?'magic':'sword',24)}<div><b>${s.name}</b><p>${s.description}</p></div><kbd>${character!.skills.includes(s.id)?s.key:'NIVEL 3'}</kbd></div>`).join('')}`);
}
let merchantId='merchant-valdoria';
function showMerchant():void{
 const supply=latest?.realms[territoryAt(scene().player.sprite.x,scene().player.sprite.y).id]?.supply??100;const price=online?Math.ceil(10*(2-supply/100)):10;
 modal('Comerciante del reino.','Los suministros de tu campaña afectan al comercio.', '<p class="dialogue">Poción: '+price+' monedas. Suministros: '+supply+'%.</p><button id="buy-potion" class="primary full">Comprar poción</button>'+(online?'<button id="sell-feron" class="secondary full">Vender 1 Feron legítimo · '+Math.ceil(6*(2-supply/100))+' monedas</button>':''));
 if(el('sell-feron'))el('sell-feron').onclick=()=>{scene().command('sell',merchantId);closeModal();};
 el('buy-potion').onclick=()=>{if(online){scene().command('buy',merchantId);closeModal();return;}if(character!.coins<10){toast('Necesitas 10 monedas.');return;}character!.coins-=10;character!.inventory.pocion=(character!.inventory.pocion??0)+1;persistence.saveLocal(character!);toast('Poción comprada.');};
}
function showForge():void{
 const amount=online?latest?.forge??0:Number(localStorage.getItem('siete-reinos:forge')??0)||0;
 modal('La herrería de Valdoria.',online?'Proyecto compartido y persistente de tu campaña.':'Proyecto de tu aventura local.', '<div class="forge-progress"><span>'+Math.min(10,amount)+' / 10 feron</span><progress max="10" value="'+Math.min(10,amount)+'"></progress></div>'+(amount<10?'<button id="contribute" class="primary full">Contribuir 1 feron</button>':'<button id="forge-upgrade" class="primary full">Entrenamiento · 5 feron / 40 EXP</button>'));
 if(el('contribute'))el('contribute').onclick=()=>{if(online){scene().command('contribute');closeModal();return;}if((character!.inventory.feron??0)<1){toast('Necesitas feron.');return;}character!.inventory.feron--;localStorage.setItem('siete-reinos:forge',String(amount+1));persistence.saveLocal(character!);if(amount+1>=10)scene().rebuildForge();showForge();};
 if(el('forge-upgrade'))el('forge-upgrade').onclick=()=>{if(online){scene().command('train');closeModal();return;}if((character!.inventory.feron??0)<5){toast('Necesitas 5 feron.');return;}character!.inventory.feron-=5;awardXp(character!,40);persistence.saveLocal(character!);toast('+40 experiencia');};
}
function showLaws():void{
 if(!playing)return;const t=territoryAt(scene().player.sprite.x,scene().player.sprite.y),realm=latest?.realms[t.id];
 const offenses={mining:'Minería ilegal',trespass:'Acceso restringido',theft:'Robo',assault:'Agresión',homicide:'Homicidio'};
 modal(t.name,'Gobierno NPC · leyes públicas · campaña '+(online?esc(campaign!.name):'local'),'<p class="dialogue">'+t.laws.map(esc).join('<br>')+'</p>'+(realm?'<p class="form-footnote">Seguridad '+realm.security+' · prosperidad '+realm.prosperity+' · suministros '+realm.supply+' · opinión '+realm.opinion+' · ley v'+realm.lawVersion+'</p>':'')+
 (latest?.cases??[]).map(c=>'<article class="case-card"><b>'+offenses[c.evidence.offense]+' · '+esc(c.status)+'</b><p>'+esc(c.reason)+'</p><small>Testigos: '+c.evidence.witnesses.length+' · multa pendiente: '+c.fine+' · prisión: '+Math.max(0,Math.ceil((c.jailUntil-Date.now())/1000))+' s</small><button data-case="'+c.id+'" data-judicial="appeal">Apelar</button>'+(c.evidence.offense==='theft'?'<button data-case="'+c.id+'" data-judicial="restitute">Restituir bienes</button>':'')+(c.capital&&campaign?.owner_id===user?.id?'<button data-case="'+c.id+'" data-judicial="review">Revisar sentencia</button><button data-case="'+c.id+'" data-judicial="execute">Confirmar ejecución revisada</button>':'')+'</article>').join('')+
 (latest?.actors.find(a=>a.id===character?.id)?.state==='jailed'?'<button id="community-work" class="primary full">Trabajo comunitario · reduce 15 s</button>':'')+
 (online?'<p class="form-footnote">'+(campaign?.mode==='hardcore'?'HARDCORE: sentencia capital solo con consentimiento, apelación resuelta, revisión humana y personaje conectado.':'CASUAL: sin muerte permanente. Cárcel de 1–10 minutos.')+' Apela ante la magistrada o desde prisión. Los permisos mineros son gratuitos. Tu reputación aquí: '+(latest?.reputation[t.id]??0)+'. Política temporal: '+esc(realm?.policy??'normal')+'.</p>':'<p class="form-footnote">La justicia persistente funciona en campañas conectadas.</p>'),true);
 document.querySelectorAll<HTMLButtonElement>('[data-judicial]').forEach(b=>b.onclick=()=>{scene().command(b.dataset.judicial as 'appeal'|'restitute'|'review'|'execute',b.dataset.case);closeModal();});
 if(el('community-work'))el('community-work').onclick=()=>{scene().command('work');closeModal();};
}
function showGuide():void{
  modal('Tu guía de Valdoria.', 'Los caminos se descubren andando.',`
    <div class="controls-grid">${[['W A S D','Moverse'],['ESPACIO / CLIC','Espada'],['Q','Proyectil mágico'],['SHIFT','Esquivar'],['E','Hablar / extraer'],['I','Inventario'],['K','Habilidades'],['M','Minimapa'],['ESC','Menú']].map(([key,label])=>`<kbd>${key}</kbd><span>${label}</span>`).join('')}</div><p class="dialogue">El pueblo está en el centro; el bosque y sus enemigos, al oeste; las minas de feron y auralita, al noreste. La afinidad inicial mejora una disciplina, pero ambos personajes pueden usar espada y magia.</p><p class="form-footnote">Las campañas usan un servidor autoritativo. L abre las leyes; F activa pantalla completa. Las minas de Duncrest están al este y Éldara al oeste. Cuatro fronteras están preparadas para futuras ampliaciones.</p>`,true);
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
  if(el('account-lobby'))el('account-lobby').onclick=()=>void operation(async()=>{await loadAccount();await showCampaigns();});
  el('sign-out').onclick=()=>void operation(async()=>{if(playing)await returnToMenu();const {error}=await requireSupabase().auth.signOut({scope:'local'});if(error)throw error;user=null;character=null;updateAccount();closeModal();toast('Sesión cerrada.');});
};
el('leave-button').onclick=()=>void operation(()=>returnToMenu());
el('room-code').onclick=()=>{if(campaign)void navigator.clipboard.writeText(campaign.invite_code).then(()=>toast('Invitación copiada.')).catch(()=>toast(campaign!.invite_code));};
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
listen<string>('toast',toast);listen('inventory',showInventory);listen('skills',showSkills);listen('pause',showPause);listen<string>('merchant',id=>{merchantId=id??'merchant-valdoria';showMerchant();});listen('forge',showForge);
listen('minimap',()=>{uiState.minimap=!uiState.minimap;el('minimap').hidden=!uiState.minimap;saveSettings();});
listen('save',()=>{if(!online&&character)persistence.saveLocal(character);});
listen<Hud>('hud',hud=>{
  if(!character)return;el('health-fill').style.width=`${hud.health/hud.maxHealth*100}%`;el('mana-fill').style.width=`${hud.mana/hud.maxMana*100}%`;
  el('health-text').textContent=`${Math.ceil(hud.health)} / ${hud.maxHealth}`;el('mana-text').textContent=`${Math.ceil(hud.mana)} / ${hud.maxMana}`;
  el('hud-level').textContent=`NV. ${character.level}`;el('xp-fill').style.width=`${character.xp/requiredXp(character.level)*100}%`;
  el('area-name').textContent=hud.area;el('interaction-hint').textContent=hud.hint;el('interaction-hint').hidden=!hud.hint;
  el('mining-bar').hidden=hud.mining===0;el('mining-bar').querySelector<HTMLElement>('i')!.style.width=`${hud.mining*100}%`;
  el('dodge-button').style.opacity=hud.dodge===1?'1':'0.45';el('minimap-player').setAttribute('cx',String(hud.x/WORLD.width*192));el('minimap-player').setAttribute('cy',String(hud.y/WORLD.height*144));
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
    if(event==='TOKEN_REFRESHED'&&session){/* refreshed JWT is used on the next WebSocket authentication */}
    if(event==='SIGNED_OUT'){const generation=++authGeneration;void Promise.resolve().then(async()=>{if(generation!==authGeneration)return;if(playing&&online)await returnToMenu();user=null;character=null;updateAccount();});}
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
  listen<{name:string;x:number;y:number;hp:number;maxHp:number}[]>('qa-remote',actors=>{el('qa-remote').textContent='REMOTOS · '+actors.map(a=>a.name+' '+a.x+','+a.y+' VIDA '+a.hp+'/'+a.maxHp).join(' · ');});
}

listen('laws',showLaws);el('laws-button').onclick=showLaws;
let lastNotice='';listen<Snapshot>('server-state',state=>{latest=state;el('player-count').textContent=state.connected+' / 4';if(state.notice&&state.notice!==lastNotice){lastNotice=state.notice;toast(state.notice);}el('quest-hud').innerHTML='<span class="eyebrow">CAMPAÑA VIVA</span>'+state.events.filter(e=>e.phase!=='complete').map(e=>'<b>'+esc(e.kind.toUpperCase())+'</b><p>'+esc(e.notice)+'</p>').join('');});
listen<string>('chest',id=>{modal('Suministros protegidos.','Tomarlos es un delito territorial.','<button id="steal-chest" class="secondary full">Tomar suministros sin permiso</button>');el('steal-chest').onclick=()=>{scene().command('steal',id);closeModal();};});
async function fullscreen():Promise<void>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.world-frame')!.requestFullscreen();}catch{toast('Este navegador no permite pantalla completa.');}}
listen('fullscreen',()=>void fullscreen());el('fullscreen-button').onclick=()=>void fullscreen();
el('compact-button').onclick=()=>app.classList.toggle('compact-hud');
el<HTMLInputElement>('zoom-control').oninput=e=>{if(playing)scene().setZoom(Number((e.target as HTMLInputElement).value));};
