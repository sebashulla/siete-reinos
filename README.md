# Los Siete Reinos · v0.2

RPG cenital en Phaser, TypeScript y Vite. Interfaz en español, dos personajes originales en pixel art, campañas privadas persistentes para hasta cuatro integrantes.

## Arquitectura

Vercel aloja el cliente. Node.js en Render verifica Supabase Auth y la pertenencia a la campaña antes de aceptar `/game`. El cliente envía intenciones; Node calcula movimiento, colisiones, daño, minería, inventarios, leyes y eventos. Supabase Realtime no participa en la partida.

La simulación de movimiento funciona a 20 Hz y los estados a 10 Hz. El servidor filtra entidades a 1250 píxeles del jugador. El cliente predice su movimiento y corrige su posición con los estados del servidor; interpola compañeros, NPC y enemigos. Durante una transacción se conserva el movimiento y se suspenden nuevas operaciones críticas. Los estados económicos y judiciales se publican después de confirmar el guardado.

`/healthz` devuelve versión, protocolo y disponibilidad del proceso. Todos los mensajes incluyen protocolo v2, campaña y secuencia; los estados también incluyen época de autoridad. Una cuenta solo mantiene una conexión activa por personaje.

## Ejecutar

Requiere Node 24.

```sh
npm ci
# Copiar .env.example a .env.local y completar las tres variables públicas.
# Copiar server/.env.example a .env.server.local y configurar el servidor.
npm run server
npm run dev
```

Cliente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GAME_SERVER_URL`. Servidor: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ALLOWED_ORIGINS`. La clave privilegiada no tiene prefijo VITE y nunca se entrega al cliente. Los archivos locales de configuración están ignorados por Git. Los ejemplos no contienen credenciales reales.

Sin servidor configurado, entrar a una campaña muestra un error. La aventura local es una opción independiente y explícita: nunca reemplaza una conexión fallida ni importa sus monedas al personaje persistente.

## Migrar y desplegar

1. Exportar datos y esquema a un directorio privado fuera del repositorio. Guardar también el catálogo real de PostgreSQL, políticas, funciones y las identidades de Auth. Para una copia completa de la plataforma usar `supabase db dump`/`pg_dump`; la exportación de progreso no reemplaza las copias de Storage ni todos los componentes gestionados de Auth. [Backups de Supabase](https://supabase.com/docs/guides/platform/backups).
2. `node --env-file=.env.server.local scripts/backup-progress.mjs /private/backup/fecha` exporta las tablas de la aplicación y los metadatos de identidad, incluyendo campañas, puntos de guardado, cambios y pruebas en v2. Ejecutarlo sin partidas conectadas: la exportación REST no es una transacción entre tablas. No ejecutar sobre un directorio dentro del repositorio. Conservar una copia completa independiente y cifrada cuando el proyecto crezca.
3. `node scripts/rehearse-migration.mjs /private/backup/v1` restaura las tablas en PostgreSQL local PGlite, comprueba el esquema real y ensaya la migración. El catálogo privado esperado es `live-catalog-and-auth.json`, exportado desde el SQL Editor; no subirlo a Git.
4. En proyectos nuevos aplicar `202610080001_initial.sql` y después `202610080002_campaigns.sql`. En el proyecto existente aplicar solo la segunda, una única vez, tras superar restauración y regresión. La migración es transaccional y aditiva: los personajes existentes quedan sin campaña; no se copian ni se reinician.
5. Crear un servicio web **Free** en Render con este repositorio, raíz del repositorio, build `npm ci --include=dev && npm run check:server`, inicio `npm run server`, health check `/healthz`. `render.yaml` contiene la configuración equivalente. Configurar las credenciales privilegiadas únicamente allí y mantener `ALLOW_HARDCORE_EXECUTIONS=false` en producción.
6. Vercel: Vite, build `npm run build`, salida `dist`. Configurar las tres variables públicas y reconstruir. Supabase Auth debe incluir el dominio publicado en Site URL y Redirect URLs. Mantener confirmación de correo y configurar SMTP para correo real cuando sea necesario.
7. No actualizar producción en Vercel hasta pasar pruebas con personajes existentes, dos sesiones independientes y cuatro usuarios, aislamiento, falsificación, repetición, reinicios y fallos de guardado.

Una campaña conserva mundo y membresías al desconectar. Cada cuenta puede pertenecer a varias; cada campaña admite un personaje activo por cuenta. El propietario elige definitivamente dónde vincular su personaje heredado mediante una operación atómica, únicamente en una campaña casual. Crear otra campaña empieza un personaje nuevo; no traslada progreso. Los nombres conservan unicidad global para preservar los personajes anteriores.

Para comprobar una exportación periódica v2 usar `node scripts/verify-backup.mjs /private/backup/fecha`. Restaura las diez tablas de la aplicación en PostgreSQL local y compara todos sus valores, incluidas campañas y plazos. La restauración del servicio Auth gestionado requiere la copia completa de plataforma independiente.

## Mundo y mecánicas

- Mundo de 5760 × 4320, sectores de decoración, colisiones compartidas entre cliente y servidor, caminos y minimapa. Valdoria, Éldara y Duncrest tienen NPC y objetivos. Auralis, Umbria, Saharim y Ceniza tienen geografía y fronteras preparadas para posteriores ampliaciones.
- Espada, magia, esquiva, vida y maná; enemigos con IA, barras de vida para jugadores y NPC, rescate de compañeros caídos y reaparición normal. Los clientes no eligen daño ni recompensas.
- Minería con alcance, duración, permiso real en vetas reguladas y recuperación de vetas. Pociones, venta de Feron legítimo con precios por suministros, herrería compartida y entrenamiento. La procedencia de cada lote impide vender o decomisar inventario legítimo como mercancía robada.
- Fronteras y leyes visibles con L, reputación territorial, advertencias, expulsión de zonas restringidas, multas, guardias, arrestos de 1–10 minutos y trabajos comunitarios con límite de frecuencia. Pruebas generadas por el servidor: autor, víctima, coordenadas, UTC, testigos y versión de ley. Las acciones de minería conservan la regla vigente al empezar para evitar sanciones retroactivas.
- Restituir bienes robados retira solo el lote ilícito. Una apelación puede anular la causa por pruebas insuficientes, terminar una sanción tras restitución o reducir el tiempo de prisión. La crisis puede poseer un guardia: su agresión registrada permite distinguir defensa legítima de una agresión iniciada por el jugador.
- Eventos deterministas: caravana con vida atacada, defensa de un comerciante del bosque y crisis en las minas. El fracaso modifica suministros, seguridad, prosperidad, opinión y precios. Resolver el objetivo recupera gradualmente los suministros. Las crisis añaden temporalmente controles mineros. Los gobiernos de jugadores permanecen fuera de esta entrega.
- El registro aceptado sustituye el formulario por el mensaje seguro de confirmación, acceso al inicio de sesión y reenvío tras 60 segundos. La selección de nombre, afinidad y apariencia se recupera después de confirmar la identidad.

## Hardcore

Se crea como mundo separado y exige consentimiento individual versionado. Una campaña casual no se puede convertir. Las muertes normales admiten rescate y reaparición. Una ejecución judicial solo puede ocurrir si el servidor la habilita explícitamente, hay reincidencia y pruebas verificadas, consentimiento de todos, apelación resuelta, revisión humana del propietario, plazo cumplido y personaje conectado. No existe un temporizador que ejecute al personaje. Los datos del personaje ejecutado quedan archivados.

**La bandera de ejecuciones está desactivada en producción.** Los requisitos se prueban en campañas aisladas. El propietario no recibe un endpoint que permita otorgar monedas ni inventario; su única intervención especial es revisar una sentencia válida.

## Persistencia y recuperación

PostgreSQL confirma cada cambio crítico en una transacción con identificador idempotente y revisión optimista. `campaign_state` guarda el punto de recuperación, `game_commits` conserva el registro de cambios críticos y `campaign_audit` las pruebas originales. Las concesiones temporales de autoridad usan una época y caducidad: un servidor anterior no puede guardar después de un relevo. Los plazos judiciales son UTC persistente y se evalúan al recuperar el mundo.

Si PostgreSQL falla se pausa el combate que altera estado, la economía y la justicia; el mismo commit se reintenta sin duplicar resultados. El cliente muestra el problema y conserva su sesión para reconectar. El servidor cierra campañas vacías y libera autoridad; no usa archivos locales para persistencia.

[Render Free](https://render.com/docs/free) puede dormir tras 15 minutos sin actividad y reiniciar servicios; el arranque puede tardar alrededor de un minuto. [WebSocket en Render](https://render.com/docs/websocket) requiere `wss://` desde HTTPS. No mantener artificialmente despierto el servicio. [Supabase Free puede pausar proyectos](https://supabase.com/docs/guides/platform/free-project-pausing); reanudarlos desde el panel y volver a conectar. Exportar periódicamente fuera del repositorio y comprobar restauración. No resetear personajes para resolver una pausa.

## Verificación

```sh
npm run build
npm run check:server
npm test
npm run test:sql
npm run test:campaigns
```

Las pruebas cubren sprites, colisiones, límites de protocolo, cuatro actores, vida y recompensas, minería, procedencia y apelaciones, rescate y UTC, restricciones hardcore, aislamiento, preservación exacta, límite de miembros, RLS, rechazo de writes del navegador, atomicidad, idempotencia y exclusión de servidores simultáneos.

Las pruebas de integración requieren cuentas QA confirmadas y sesiones de Auth independientes. Nunca guardar sus contraseñas en informes o en Git. Usar dos orígenes locales (`127.0.0.1` y `localhost`) o perfiles independientes para la prueba visual; dos pestañas del mismo origen comparten Auth.

`npm run test:online` verifica cuatro identidades contra PostgreSQL real y un servidor local, incluyendo pérdida de confirmación del commit, interrupción de persistencia y reinicio. `npm run test:online -- --remote` comprueba cuatro conexiones en el servidor publicado. `node --env-file=.env.local --env-file=.env.server.local --import tsx scripts/verify-gameplay.mjs` recorre el mapa y comprueba minería y recompensas reales con dos cuentas QA. Son pruebas que crean campañas aisladas y modifican únicamente sus personajes de prueba; los informes quedan ignorados en `artifacts/`.

## Controles y arte

WASD/flechas: moverse; espacio/clic: espada; Q: magia; Shift: esquiva; E: hablar, minar o rescatar; I: inventario; K: habilidades; M: minimapa; L: leyes; F: pantalla completa; Esc: menú. Zoom ajustable y paneles plegables. Abrir un diálogo detiene a tu personaje; el mundo compartido continúa.

18 spritesheets originales generados por código (2 afinidades × 3 paletas × 3 tonos), 160 frames transparentes de 32×32 por hoja: idle, caminar en cuatro direcciones, ataque, daño y muerte. `npm run assets` los regenera. La representación visual permanece separada de estadísticas y reglas; `src/shared` no depende de Phaser.
