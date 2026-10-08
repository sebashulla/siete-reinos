# Los Siete Reinos · Web Edition

Prototipo RPG cenital en Phaser 3, TypeScript estricto y Vite, sin React. Interfaz en español. Recursos originales de pixel art generados por código, sin imágenes de terceros.

## Ejecutar

Requiere Node.js 22.12 o superior.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

En PowerShell: `Copy-Item .env.example .env.local`. Rellena únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` para conectar el juego. El archivo `.env.local` está ignorado por Git. Sin configuración válida sigue disponible la aventura local; las salas en línea muestran que necesitan Supabase.

## Preparar Supabase

1. Ejecuta `supabase/migrations/202610080001_initial.sql` como postgres desde SQL Editor, una sola vez en un proyecto nuevo.
2. Realtime → Settings: desactiva **Allow public access to channels**. El cliente usa siempre `config.private: true`.
3. Authentication → URL Configuration: configura Site URL y Redirect URLs para los orígenes locales y la URL de Vercel. En desarrollo: `http://127.0.0.1:5173` y `http://localhost:5173`.
4. Mantén el registro con correo/contraseña y la confirmación de correo. Para usuarios reales configura un proveedor SMTP si los límites del correo de desarrollo no bastan.
5. Registra dos cuentas desde la aplicación, confirma sus correos, inicia sesión y crea sus personajes. Los nombres son únicos, sin distinguir mayúsculas, de 3–18 letras ASCII, números o guion bajo. Si hay un conflicto de nombre después de confirmar el correo, el formulario permite elegir otro.
6. La primera persona crea una sala; la segunda introduce su código de 12 caracteres. Hay un máximo de cuatro integrantes. Usa dos perfiles de navegador o una ventana privada para sesiones independientes. En pruebas locales también puedes usar `127.0.0.1` y `localhost`, que tienen almacenamiento de Auth separado.

## Disponible

- Registro, inicio y cierre de sesión con Supabase Auth; confirmación por correo y recuperación automática de sesión.
- Un personaje por cuenta: espadachín o mago; tres colores de vestimenta y tres tonos de piel. Recuperación de nivel, experiencia, equipo, inventario y habilidades desde PostgreSQL.
- Salas privadas: crear, unirse por código, regresar después de recargar, abandonar y transferir la propiedad al salir. Diez intentos de código por minuto por cuenta; bloqueo de salas completas mediante transacción y bloqueo de fila.
- Multijugador real: Presence y Broadcast privados, posiciones interpoladas y animaciones de espada, magia, esquiva y extracción. Combate cooperativo de práctica con cuatro enemigos: el creador simula su IA y vida temporal, los demás reciben snapshots interpolados cada 350 ms y sus ataques se procesan en ese anfitrión. Sin recompensas persistentes. Integrantes canónicos obtenidos de SQL; suscripciones y jugadores remotos eliminados al desconectarse. Movimiento a un máximo aproximado de 5,3 mensajes/s por jugador; posición estacionaria cada 800 ms. Presence se publica al suscribirse o reconectar, nunca en cada frame.
- Valdoria, bosque, minas, lago y círculo antiguo; cámara, colisiones, minimapa, NPC y diálogos.
- Aventura **local separada**: enemigos con persecución, espada, proyectiles, daño, muerte y reaparición; experiencia, niveles, habilidad híbrida desde nivel 3, minería, inventario, pociones, comerciante y contribuciones a la herrería. Guarda en este navegador. No se importa a la cuenta ni otorga recompensas online.
- 18 spritesheets de personajes (2 afinidades × 3 paletas × 3 tonos de piel), de 256×640 px, con 160 celdas transparentes de 32×32 px. Filas: idle, caminar, ataque, daño y muerte; en cada acción, abajo, izquierda, derecha y arriba. Ocho frames por fila. `public/assets/sprites.json` documenta el formato; `npm run assets` los regenera de manera reproducible.
- Menú principal, lobby, personalización, ajustes de interfaz y guía. El menú presenta una ilustración del mapa, identificada como tal, sin contar sus figuras como jugadores conectados.

## Controles

| Tecla | Acción |
|---|---|
| WASD / flechas | Caminar |
| Espacio / clic izquierdo en el mapa | Espada |
| Q | Proyectil mágico |
| Shift | Esquiva, recarga de 1,5 s |
| E | Hablar / extraer mineral cerca de una veta |
| I / K | Inventario / habilidades |
| M | Mostrar u ocultar minimapa |
| Esc | Menú / cerrar diálogo |

En línea, abrir un diálogo detiene a tu personaje y los demás pueden continuar.

## Seguridad y límites

El navegador utiliza **solo la URL pública y la publishable key**. No contiene ni necesita claves secretas o service_role. Nunca añadas una clave administrativa a una variable `VITE_`. No uses la antigua anon key junto a la publishable key: el cliente solo necesita esta última.

`profiles` y `characters` son legibles únicamente por su propietario mediante RLS. Las tablas no conceden permisos de escritura a `anon` o `authenticated`. Los RPC de creación y personalización verifican `auth.uid()` y solo admiten los campos permitidos; las estadísticas iniciales las fija SQL. El JSON de apariencia rechaza campos adicionales. No existe un RPC cliente para aumentar experiencia, nivel, materiales o monedas.

Las membresías y salas se modifican solo mediante RPC. Cada emisor publica en `room:<uuid>:player:<auth.uid()>`. Las políticas sobre `realtime.messages` permiten recibir solo a integrantes y escribir solo en el canal propio, por lo que falsificar un identificador en un payload no permite actuar como otro jugador. La lectura pública del roster devuelve únicamente nombre, afinidad y apariencia a integrantes de esa misma sala. Realtime tiene que estar configurado para rechazar canales públicos.

**Realtime no es un servidor autoritativo.** Un cliente modificado puede falsear su propia posición o animación. Validación de payloads, límites locales y secuencias protegen al cliente normal contra paquetes inválidos y repetidos; no prueban que una acción haya ocurrido. El anfitrión coordina el daño y vida compartidos de los enemigos **solo como estado temporal de práctica**; limita la distancia, enfriamientos y maná de las acciones remotas recibidas, pero él también es un cliente manipulable. La salud del jugador, su maná y su reaparición son locales y efímeros. La minería en línea comparte la animación de extracción y no crea materiales guardados. Ninguna de esas acciones produce recompensas persistentes. El inventario online conserva sus valores del servidor y no consume pociones sin una operación verificada.

Solo se aceptan snapshots de enemigos desde el canal del propietario SQL actual. Si el propietario cierra el navegador sin abandonar la sala, la simulación espera su regreso y la vida temporal puede reiniciarse. Al abandonar explícitamente la sala, SQL transfiere la propiedad; el siguiente anfitrión continúa desde las réplicas recibidas, con posibles reinicios de enemigos y temporizadores. Esto no sustituye un servidor dedicado ni garantiza continuidad sin desincronizaciones. Los combates de práctica usan atributos base para los atacantes remotos; la progresión online avanzada queda para el servidor.

Supabase calcula y almacena los permisos privados al conectar/renovar JWT; una revocación de membresía no expulsa inmediatamente un socket malicioso ya abierto ([documentación oficial](https://supabase.com/docs/guides/realtime/authorization)). Los clientes normales consultan el roster cada 4 s y eliminan las suscripciones revocadas. Para revocación estricta inmediata será necesario un gateway autoritativo y una política de tokens apropiada. Los códigos conceden acceso a quien los conoce; no son invitaciones vinculadas a un correo.

La pertenencia permanece si se cierra el navegador; permite volver a la sala desde el lobby. Presence representa las conexiones actuales. El botón salir elimina la membresía; al quedar vacía, la sala se cierra. Si todos abandonan el navegador sin salir, la sala permanece recuperable. Limpieza por expiración queda pendiente para el backend.

## Próxima etapa

Implementar un servidor que valide movimiento, distancia, enfriamientos, salud de enemigos y disponibilidad de vetas, mantenga el estado compartido y otorgue recompensas mediante transacciones idempotentes. Solo ese proceso podrá escribir progresión, inventario y economía. La interfaz de red (`MultiplayerService`) y los sistemas de datos están separados de `Player` y de sus sprites para sustituir el transporte y las reglas sin rehacer la representación visual.

Quedan pendientes: reemplazar el anfitrión cliente por enemigos/combate autoritativos de servidor, minería con recompensas online, construcción comunitaria entre cuentas, mejoras de equipo online y modo Conquista PvP con captura. No se muestran botones de Conquista que aparenten funcionar. El círculo del mapa está disponible para explorar.

## Comprobaciones

```sh
npm run test       # XP, inventario, protocolo, interpolación y 2.880 frames de sprites
npm run test:sql   # PostgreSQL embebido: migración real y permisos/RLS/RPC
npm run build     # TypeScript estricto + compilación de producción
npm run test:online
```

`test:online` usa dos clientes Supabase independientes, sin sesión compartida ni mocks. Configura `TEST_EMAIL_A`, `TEST_PASSWORD_A`, `TEST_EMAIL_B`, `TEST_PASSWORD_B` en `.env.local` con **cuentas de prueba confirmadas**, nunca variables `VITE_`. Crea personajes si faltan, sale de salas previas de esas dos cuentas, crea una sala nueva y verifica Broadcast en ambas direcciones, Presence, reconexión, recuperación de progreso, rechazo de escritura de estadísticas y acceso denegado a un cliente externo. Al terminar abandona la sala y cierra las conexiones. Conserva las cuentas/personajes de prueba. Escribe un informe sin credenciales en `artifacts/online-verification.json` (ignorado por Git). Una prueba fallida nunca acredita conexión real.

Validación realizada el 8 de octubre de 2026 en el proyecto Supabase configurado: las cuentas **QA_Sol** y **QA_Luna** iniciaron sesión desde `127.0.0.1` y `localhost`, con almacenamiento de Auth independiente. Ambas entraron por código, se vieron moverse en Valdoria y atacaron al mismo enemigo: espada y magia redujeron su vida de 70 a 10; la derrota y la reaparición se reflejaron en ambas sesiones. Se verificó también la salida de la sala y la eliminación de Presence. El informe automatizado completó sus 13 comprobaciones de red y permisos. La compilación, las ocho pruebas de sistemas/recursos gráficos y la validación SQL pasaron.

Estas dos cuentas se crearon y confirmaron desde el panel administrativo, con autorización del propietario, porque el registro público de Supabase rechazó los correos del dominio reservado `example.com`. Por tanto, la prueba acredita login, creación de personajes mediante RPC, persistencia y red real; **no acredita entrega del correo de confirmación ni un registro público completo con correo real**. El formulario de registro y la confirmación permanecen habilitados para usuarios reales. Las contraseñas de prueba solo están en `.env.local`, fuera de Git. La prueba en navegador de minería local verificó feron de 0 a 1 y experiencia de 0 a 12; ese progreso no se importó a Supabase.

En desarrollo, `?qa=1` muestra botones que mantienen una dirección durante un segundo para pruebas repetibles en navegador. Mueven al jugador mediante la misma física y el mismo transporte real; no crean compañeros simulados ni modifican el progreso. Esos controles se excluyen de la compilación de producción.

## Vercel

1. En Vercel, importa el repositorio GitHub como un proyecto nuevo. Selecciona **Vite**, directorio raíz del repositorio, build `npm run build` y output `dist`.
2. Antes de desplegar, configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con los valores públicos del proyecto Supabase. Se incorporan durante la compilación; si los cambias, vuelve a desplegar. Las credenciales locales y de las cuentas QA no se suben a GitHub.
3. Despliega y copia la URL HTTPS asignada por Vercel.
4. En Supabase → Authentication → URL Configuration, configura esa URL como **Site URL** y añádela a **Redirect URLs** para que la confirmación de correo regrese al juego publicado. Puedes conservar los dos redirects locales para desarrollo.
5. Prueba dos cuentas desde dos perfiles de navegador o una ventana privada en la URL publicada. `localhost` y `127.0.0.1` sirven únicamente en tu computadora.

`vercel.json` ya incluye la compilación y los encabezados básicos. Esta versión no necesita ejecutar `npm run dev` ni mantener encendida tu computadora después del despliegue: **Vercel sirve la web; Supabase aloja Auth, PostgreSQL y Realtime**. El navegador del creador de la sala coordina los enemigos de práctica mientras está conectado. Vercel no convierte ese cliente en un servidor autoritativo. Para recompensas verificadas, economía y PvP seguro habrá que implementar un backend de validación; las operaciones por solicitud pueden alojarse, por ejemplo, en Supabase Edge Functions o Vercel Functions, y una simulación continua requerirá una solución adecuada para mantener su estado. Ninguno de esos servicios adicionales está implementado en esta versión.

## Estructura

`src/scenes`: LobbyScene / GameScene. `src/entities`: Player / Enemy. `src/systems`: combate, inventario, recursos y progresión. `src/services`: Supabase, persistencia y multijugador. `src/net`: protocolo y validación. `src/art`: carga y animaciones. `src/data`: estadísticas, habilidades, objetos y tipos. `scripts/generate-assets.mjs`: dibujo original por píxeles, paletas, props y spritesheets. `supabase/migrations`: esquema y permisos.

Recursos y código originales de este proyecto: licencia MIT. Los sprites son arte programático deliberado, no imágenes producidas por una herramienta de generación artística.
