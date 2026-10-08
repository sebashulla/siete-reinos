# Validación de la entrega v0.2 · 8 de octubre de 2026

La entrega usa Node como autoridad única, con WebSocket real hacia Render y persistencia en el proyecto Supabase. Las pruebas no sustituyen conexiones por jugadores simulados.

- Build de Vite y comprobación estricta de TypeScript del servidor correctos.
- 17 pruebas de reglas y sprites; suites SQL de la versión anterior y de campañas correctas.
- Antes de migrar: exportación privada del esquema real, datos e identidades fuera de Git; restauración de tablas y ensayo de migración en PostgreSQL local PGlite. Los tres personajes originales conservaron exactamente sus campos al aplicar la migración.
- Después de migrar: copia v2 de diez tablas, restauración y comparación exacta de los 31 personajes y de los puntos de guardado, cambios y antecedentes existentes, incluidos datos QA. Esta comprobación restaura la aplicación; la plataforma Auth gestionada necesita su propia copia completa.
- El personaje de la cuenta real conserva todos los campos anteriores, incluidos timestamps, y permanece pendiente de asignación. Los dos personajes QA heredados se vincularon una sola vez a una campaña casual; la vinculación no alteró su progreso. Sus posteriores acciones de prueba sí pueden cambiar su progreso mediante el servidor.
- Cuatro identidades Auth independientes: movimiento a velocidad validada, estados a 10 Hz, vida y daño compartido. Verificado tanto en el servidor local con PostgreSQL real como en Render.
- Dos identidades en Render: recorrido a bosque y minas mediante intenciones y colisiones, mineral y recompensas de combate confirmados en PostgreSQL, recuperación de veta y rechazo de mensajes repetidos.
- Dos sesiones de navegador con almacenamiento independiente: QA_Sol y QA_Luna en la misma campaña; el movimiento observado por el compañero coincide con el estado del servidor.
- Rechazo de acceso a otra campaña, valores de monedas/vida enviados por un cliente y writes directos de progresión. RLS, capacidad de cuatro, consentimiento hardcore individual y vinculación casual exclusiva verificados.
- Pérdida de la respuesta tras un commit: reintento con el mismo identificador, sin duplicar recompensa. Interrupción de persistencia: no se publican sanciones especulativas ni se aceptan nuevas operaciones críticas. Reinicio: recuperación de inventario, causa, plazo UTC y época de autoridad.
- Sanciones reversibles, restitución por procedencia, apelaciones efectivas, legítima defensa y ausencia de retroactividad comprobadas. Ejecución bloqueada en casual y con bandera de producción desactivada; las pruebas aisladas requieren consentimiento, pruebas de reincidencia, apelación, revisión humana y conexión del acusado.
- Supabase aceptó una solicitud de registro QA y la interfaz mostró el mensaje genérico previsto, acceso al inicio de sesión y espera de 60 segundos. Esta prueba no acredita la entrega de correo a una bandeja real; los correos QA usan el dominio reservado example.com.

Los informes y las credenciales QA están ignorados por Git. Los esquemas y scripts reproducibles están en `supabase/`, `scripts/` y `tests/`.
