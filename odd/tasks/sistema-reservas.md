# Feature: Sistema de reservas de eventos (v1)

## Objetivo

Aplicación web mobile-first donde los clientes del local descubren eventos próximos, reservan su lugar y pagan por transferencia; y donde la dueña administra eventos, valida pagos y aprueba o rechaza reservas desde un panel privado.

## Problema

Hoy todo el flujo (consulta, reserva, pago, confirmación) se resuelve 1 a 1 por WhatsApp. No escala y consume el tiempo de la dueña.

## Alcance v1

Incluido:
- Catálogo público de eventos con detalle.
- Formulario de reserva con datos personales, condiciones de salud, datos declarados de la transferencia y comprobante adjunto.
- Retención de cupo al enviar el formulario, con vencimiento por timer.
- Panel admin con login: CRUD de eventos, lista de reservas, ver comprobante, aprobar / rechazar.
- Página de seguimiento por token para que el cliente consulte el estado (sin cuenta ni contraseña).
- Botón "Avisar por WhatsApp" con mensaje pre-armado (deep link).
- Listado de clientes con mail y WhatsApp para uso futuro.

Fuera de alcance (explícito):
- Integración de pagos automáticos (MercadoPago). Decisión: transferencia manual al alias.
- Envío de emails al cliente.
- Envío masivo de promociones.
- Cuentas de cliente / login del cliente.
- Automatización de WhatsApp vía Cloud API.

## Restricciones no negociables

1. El cupo se reserva con transacción + lock en la base de datos. Nunca un `if` de disponibilidad en el código de aplicación.
2. Los comprobantes viven en bucket privado y se sirven con URL firmada con expiración.
3. El vencimiento de reservas sin comprobante se calcula en la consulta. Sin cron, sin colas, sin Redis.
4. El formulario debe funcionar en celular con red inestable: compresión de imagen en el cliente y reintento visible.
5. Datos sensibles (condiciones de salud) con consentimiento explícito y sin uso para marketing.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + Postgres + Drizzle ORM + Supabase (base y storage) + Vercel.

## Reglas de código

- Server Components por defecto; `"use client"` solo con interacción real.
- Server Actions para toda escritura. Sin API propia para el formulario.
- Sin librerías de estado.
- Sin capas prematuras (repository / service / usecase) hasta que duela.
- Un schema Zod por formulario. Entrada no validada no toca la base.
- Los estados de la reserva son un tipo literal único.
- Sin `any`, sin código muerto. Nombres en inglés.

## Modelo de datos

Implementado en `src/db/schema.ts`. Tres tablas: `events`, `customers`, `reservations`.

- **events**: título, temática, descripción, imagen, lugar, inicio y fin (`timestamptz`), capacidad, precio, publicado (bool), timestamps.
- **customers**: nombre completo, email, WhatsApp, consentimiento de marketing (bool + fecha), timestamp. El email es único: eso es lo que hace real el dedupe por persona.
- **reservations**: event_id, customer_id, estado, token público, vence_en, datos declarados de transferencia (titular, monto, fecha, nro. de operación), comprobante (ruta, tipo, fecha de subida), condición de salud declarada, aceptación de términos, motivo de rechazo, timestamps.
  - El comprobante se guarda EN la reserva y no en tabla aparte: se permite una única subida, una tabla extra sería bloat.

Decisiones del modelo que conviene tener presentes:

- El precio se guarda como `numeric(10,2)`, no como `float`. Drizzle lo devuelve como **string**, a propósito: un precio nunca debe pasar por un número de coma flotante.
- `full_name` es un solo campo. Separar nombre y apellido no aporta nada en v1.
- `location` se agregó como campo opcional porque un evento sin lugar no sirve. Es el único campo que se sumó respecto de lo acordado en Discovery.
- La fecha/hora se guardan como dos instantes (`starts_at`, `ends_at`) en vez de fecha + hora suelta. Un instante no tiene ambigüedad; una fecha y una hora separadas sí.

### Reglas de integridad impuestas por la BASE, no por el código

- `reservations_public_token_unique`: el token de seguimiento no se repite.
- **`reservations_active_per_person_unique`**: índice único **parcial** sobre `(event_id, customer_id)`, limitado a los estados que ocupan cupo. Es la regla "una reserva activa por persona y evento", impuesta por el motor. Una reserva rechazada, expirada o cancelada **no** bloquea un nuevo intento.
- `reservations_event_status_idx`: soporta el conteo de cupos por evento y estado.
- FKs con `ON DELETE RESTRICT`: no se puede borrar un evento ni una persona que tengan reservas asociadas.

### Estados

Nombres en inglés, como todo identificador del proyecto:

`pending_no_receipt` → `pending_review` → `approved` | `rejected`, más `expired` y `cancelled`.

Los dos pendientes NO son lo mismo, y esto es la decisión central del sistema:

- `pending_no_receipt`: ocupa cupo y **vence por timer** (30 min por defecto). Todavía no pagó, así que el sistema puede soltar el lugar solo.
- `pending_review`: ocupa cupo y **NO vence por timer**. El dinero ya salió de la cuenta de la persona; liberar ese lugar automáticamente sería perderle la plata a alguien.

Ocupan cupo: `pending_no_receipt`, `pending_review`, `approved`.

## Tareas

- [x] **T1 Bootstrap** — Next.js + TS + Tailwind, estructura de carpetas, alias de imports, variables de entorno.
- [x] **T2 Modelo de datos** — schema Drizzle, migración inicial, constraints (unicidad de una reserva activa por persona y evento).
- [x] **T3 Conexión y seed** — cliente de base, script de seed con eventos de prueba. **Cerrada y verificada contra la base real**: migración aplicada, 3 tablas y 7 índices creados, 4 eventos cargados, y la restricción R1 probada a propósito (la base rechaza la segunda reserva activa de la misma persona en el mismo evento, y la acepta si la anterior fue rechazada). La prueba queda en `scripts/verify-constraints.sql`.
- [x] **T4 Catálogo público** — listado de eventos publicados y detalle de evento. **Cerrada y verificada contra el servidor real**: los 3 eventos publicados se renderizan, el borrador no aparece en el cuerpo de ninguna respuesta, los lugares libres bajan de 12 a 11 al insertar una reserva real, y una reserva vencida **no** descuenta (R3 evaluado en SQL). Identidad visual **muestreada del logo real** con `sharp` (azul índigo + acento rosa mediterráneo + crema `#FCF8F5` + Montserrat), no inventada. Queda una incidencia conocida y aceptada: el detalle de un evento borrador responde `200` con la pantalla de "no encontrado" en vez de `404` — ver P6 en `PROGRESO.txt`.
- [x] **T5 Formulario de reserva** — validación Zod, transacción de cupo, creación de reserva pendiente con vencimiento. **Cerrada y verificada**: `npx tsc --noEmit` exit 0, `npm run build` exit 0, y la concurrencia probada de verdad con `scripts/verify-concurrency.mjs` (evento de 1 lugar con 8 intentos simultáneos de correos distintos → 1 aceptada y 7 rechazadas por falta de cupo; evento de 5 lugares con 2 intentos simultáneos del MISMO correo → 1 aceptada y 1 rechazada por reserva duplicada). Eso demuestra R1: el cupo se decide en la base con `SELECT ... FOR UPDATE`, no con un `if` en la aplicación.
- [x] **T6 Comprobante** — subida a bucket privado, compresión en cliente, datos declarados. **Cerrada**: la foto se sube directo a Supabase con URL firmada (evita el límite de 1 MB del cuerpo de los Server Actions), con compresión previa en el navegador; al enviar, la reserva pasa a `pending_review` y se le limpia el vencimiento (a partir de ahí no se libera sola). `npx tsc --noEmit` exit 0 y `npm run build` exit 0.
- [x] **T7 Auth admin** — login con usuario y contraseña, cookie de sesión, protección de rutas. **Cerrada y verificada contra el servidor real** (status codes medidos con curl, no deducidos): `/admin/login` sin sesión → 200 (sin bucle de redirección); `/admin` sin sesión → 307 a `/admin/login`; con cookie válida → 200; con cookie **vencida**, **manipulada** o de **otro usuario** → 307. Y el POST real del formulario: contraseña incorrecta → 303 a `?error=credentials` **sin** cookie; contraseña correcta → 303 a `/admin` con `Set-Cookie` `HttpOnly; Secure; SameSite=lax; Max-Age=604800`, y esa cookie emitida sirve para entrar (200). Sin dependencias nuevas: hash `scrypt` con el `crypto` de Node, generador en `scripts/hash-admin-password.mjs` como única fuente de los parámetros, y sesión por cookie firmada con HMAC (sin tabla de sesiones). Falla cerrado: sin variables de entorno no entra nadie.
- [x] **T8 CRUD de eventos** — crear, editar, publicar y despublicar desde el panel. **Cerrada y verificada contra la base real**: `npx tsc --noEmit` exit 0, `npm run build` exit 0, y `scripts/verify-events-admin.mjs` (mismo patrón que `verify-concurrency.mjs`: importa el módulo real `src/lib/events.ts` contra Postgres) pasa sus escenarios con exit 0 y deja la base como estaba. Lo que probó, observado y no deducido: el guard de capacidad **rechaza** `capacity < ocupados` y **acepta** `capacity == ocupados`; una retención `pending_no_receipt` **vencida** no cuenta como ocupada; `cancelled`/`rejected`/`expired` no cuentan; `approved` sí ocupa; despublicar deja la cantidad de reservas intacta; e ids mal formados devuelven `not_found`/`null` sin 500. Sin borrar evento en v1 (FKs `ON DELETE RESTRICT`) y sin imagen (diferida a P9).
- [x] **T9 Gestión de reservas** — lista con filtros, ver comprobante, aprobar y rechazar con liberación de cupo. **Cerrada y verificada contra la base real**: `npx tsc --noEmit` exit 0, `npm run build` exit 0, `npx eslint` de los archivos nuevos exit 0, y `scripts/verify-reservations-admin.mjs` (mismo patrón que T8: importa el módulo real contra Postgres) pasa los 10 escenarios con `RESULT: PASS`, exit 0, y deja la base con los mismos conteos de filas. Lo probado con números, no por lectura: aprobar deja `occupied/seatsAvailable` **idénticos** (`1/4 → 1/4`) y rechazar libera **exactamente un lugar** (`1/4 → 0/5`) — la liberación de cupo es por predicado, no por un contador; en cualquier estado que no sea `pending_review` las dos transiciones devuelven `false` y la fila queda intacta; el doble clic no reaplica; rechazar sin motivo guarda `null` (no `""`); ids mal formados devuelven `false`/`null` sin 500; la lista filtra por evento, por estado y por ambos, y **no** expone la condición de salud. Único hallazgo de la verificación: el action pasaba `formData.get("rejectionReason")` (que devuelve `null` si falta el campo) a `z.string().optional()`, que en Zod v4 **rechaza** `null`; corregido normalizando a `undefined`.
- [x] **T10 Vencimiento y seguimiento** — cálculo de expiración y página pública de estado por token. **Cerrada y verificada contra la base real**: `npx tsc --noEmit` exit 0, `npm run build` exit 0, `npx eslint` de los archivos tocados exit 0, y `scripts/verify-reservations-expiry.mjs` + `scripts/verify-concurrency.mjs` + `scripts/verify-constraints.sql` (R1) todos en verde, con la base con los mismos conteos antes y después. Lo que se probó con números: la regla de vencimiento quedó en **una sola expresión SQL** (`effectiveStatusSql`: `pending_no_receipt` con `expires_at` vencido o `NULL` → `expired`), espejo exacto del predicado de cupos y evaluada por el reloj de la base — verificada contra un oráculo SQL independiente en filas vencida/vigente/NULL; `pending_review` con `expires_at` vieja **no** vence; el filtro "Expirada" del panel devuelve las vencidas por timer y el badge coincide; `getReservationByToken` **no** selecciona la condición de salud; la página pública distingue `approved`/`rejected` (con motivo)/`expired`/`cancelled` y dejó de mentir en el caso vencido (ya no dice "te guardamos el lugar" con una fecha pasada). **Defecto real encontrado por la verificación y corregido**: una retención vencida nunca se persistía como `expired`, así que el índice único parcial la seguía contando activa y la persona **no podía volver a reservar** el mismo evento para siempre (con el cupo libre); se corrige materializando el vencimiento dentro de la misma transacción de `createReservation` (`UPDATE ... status='expired' WHERE status='pending_no_receipt' AND (expires_at IS NULL OR expires_at <= now())`), que es race-free por el `FOR UPDATE` del evento, idempotente y no mueve ningún conteo. Verificado por un verificador **independiente** en dos pasadas: defecto confirmado con evidencia dura y corrección confirmada funcionando (re-reserva `{ok:true}`, cupo vivo intacto, R1 y concurrencia verdes, único write de `expired` en `src/lib/reservations.ts:148`).
- [x] **T11 WhatsApp 1 toque** — botón con deep link y mensaje pre-armado. **Cerrada y verificada**: `npx tsc --noEmit` exit 0, `npm run build` exit 0, `npx eslint` de los archivos tocados exit 0, y `scripts/verify-whatsapp.mjs` (puro, sin base) `RESULT: PASS`. Lo que se probó con números: la tabla de normalización (`11 5555-6666` → `541155556666`; `011-…` → igual; `+54 9 11 …` → `54911…`; `54911…` se queda; `15 5555 6666` → `5455556666`, que con 10 dígitos es `null` — el resultado correcto cuando el formato viejo no trae código de área, en lugar de los 12 dígitos con un 5 de más que escribí por error en el spec y el writer corrigió en la implementación); inválidos (`texto suelto` → `null`, `5401155556666` con 14 dígitos → `null`); round-trip EXACTO del `?text=` (acentos, ¡, ñ, %, &); mensajes por estado (saluda con el primer nombre, embebe evento/fecha/precio, motivo en rechazo solo si existe, fecha límite y alias en retención, "que te pasamos por este chat" con alias null, `CONFIRMADA` en approved, sin emojis). `gentle-ai review assess` → high (mecánicamente `unassessable`: archivos sin trackear) → verificador **independiente** que atacó con su propia tabla de 11 bordes (incluida la trampa del dígito de más) y confirmó T11 funcionando; spot check del orquestador: script PASS + tsc 0. Ruta: **delegada** (un writer; `src/lib/whatsapp.ts` nuevo + detalle del panel + script). P3 queda parcialmente respondido: el aviso de rechazo es ahora un toque editable, no automático.
- [x] **T12 Clientes** — listado y exportación. **Cerrada y verificada contra la base real**: `npx tsc --noEmit` exit 0, `npm run build` exit 0, `npx eslint` de los archivos tocados exit 0, y `scripts/verify-clients.mjs` `RESULT: PASS`. Lo que se probó con números: agregados contra un oráculo SQL independiente (A = 3 reservas / 2 activas con retención viva, B = 1/1, C = 1/0 con `expires_at` vencida explícita, `NULL expires_at` → 0 activas: el timer pliega por `effectiveStatusSql`), orden por actividad más reciente, búsqueda por nombre/email/whatsapp con escape de `%`/`_`/`\` (los literales NO filtran todo), CSV con BOM/CRLF exacto a nivel byte (comillas duplicadas, salto de línea dentro del campo, header exacto). `gentle-ai review assess` → high (unassessable: archivos sin trackear) → verificador **independiente** con datos propios (`VRFY-*` en 8 eventos) y su propio oráculo raw SQL: **T12 CONFIRMADA FUNCIONANDO**, sin fuga de datos de salud ni de marketing. Dos observaciones de diseño aceptadas: el listado es inner join (un cliente sin reservas no aparece; los clientes existen a través de sus reservas) y una búsqueda vacía devuelve `{search:""}` (falsy → sin filtro, nunca 500). Ruta: **delegada** (un writer, 6 archivos: `src/lib/clients.ts` + `parseAdminClientFilters` + página + route handler con sesión ANTES de tocar datos + card del dashboard + script). **Con esto cierra el lote autorizado T8–T12.**

## Estrategia de entrega

- Commit por unidad de trabajo, en la rama de la feature. **El agente commitea por unidad de trabajo de forma autónoma (desde T5 en adelante); publicar (push) y mergear siguen siendo decisión del usuario.**
- Estimación de líneas escritas para v1: ~2000. Supera ampliamente el umbral de ~400, así que el trabajo se organiza en slices revisables por tarea, no como un PR único.

## Progreso

- Discovery cerrado. Decisiones de producto registradas en memoria.
- **T1 cerrada**: proyecto Next 16.4 + React 19 + Tailwind v4 + TypeScript 5 generado, entorno verificado, documentación de Next 16 mapeada (8 hallazgos en `PROGRESO.txt` sección 6).
- **T2 cerrada**: `src/db/schema.ts` escrito y la migración inicial generada y **revisada línea por línea** (`drizzle/0000_lowly_cammi.sql`). El índice único parcial quedó correcto, que era el punto de mayor riesgo del modelo.
- **T3 cerrada y verificada**: migración aplicada contra la base real (`migrations applied successfully`), 3 tablas (`customers`, `events`, `reservations`) y los 7 índices creados, 4 eventos de prueba cargados (3 publicados + 1 borrador).
- **R1 probada de verdad**: `scripts/verify-constraints.sql` demuestra que la base **rechaza** la segunda reserva activa de la misma persona en el mismo evento (`llave duplicada viola restricción de unicidad «reservations_active_per_person_unique»`) y que **la acepta** cuando la anterior quedó rechazada. No es que el índice exista: es que muerde.
- Base de datos: **Postgres 18 local** ya instalado en la máquina, en lugar de Supabase. Supabase queda para cuando se despliegue. El esquema es idéntico en ambos casos porque los dos son Postgres.
- Incidente resuelto: el usuario no recordaba la contraseña del superusuario `postgres`. Se recuperó con el procedimiento estándar (trust temporal en loopback + recarga desde consola elevada + restauración + verificación). Queda documentado en `PROGRESO.txt`, sección 12. **La contraseña nueva de `postgres` es `postgres_dev_2026`**, conviene cambiarla por una propia.
- Sin repositorio git inicializado: lo maneja el usuario.
- Verificación: todo lo anterior está comprobado **consultando la base**, no leyendo archivos.
- **T4 cerrada y verificada**. La regla de cupos quedó en una sola consulta, con la expiración evaluada en SQL (`now()`), sin reutilizar la lista estática `OCCUPYING_STATUSES`: esa lista no puede expresar el timer y habría hecho encoger el cupo para siempre.
- Próximo paso: **T5 (formulario de reserva)**. Es la tarea más delicada del proyecto: acá nace la reserva, con transacción y lock. Es donde R1 tiene que aguantar concurrencia real, no en teoría.

### T5 en curso — decisiones tomadas ANTES de escribir código

- **T5 es el paso 1, no el formulario completo.** La propia lista de tareas ya
  separa T6 ("Comprobante: subida a bucket privado, compresión en cliente, DATOS
  DECLARADOS") de T5. Entonces T5 crea la reserva en `pending_no_receipt` con
  datos personales, salud, términos y consentimiento; T6 agrega los datos de la
  transferencia y el comprobante y la pasa a `pending_review`.
- **El lock es `SELECT ... FOR UPDATE` sobre la fila del evento.** Es lo que
  serializa los intentos de reserva sobre un mismo evento. Contar y después
  insertar, sin lock, permite vender dos veces el último lugar: los dos leen el
  mismo cupo y los dos insertan. Con el lock, el segundo intento espera y ve el
  cupo ya consumido.
- **El vencimiento se evalúa en SQL (`now()`), no en el código de aplicación.**
  Igual que en T4. Una reserva `pending_no_receipt` vencida deja de ocupar cupo
  sin que nadie corra nada (R3).
- **El choque de "una reserva activa por persona y evento" se traduce a un
  mensaje, no a un error 500.** La base ya lo impide (índice único parcial). El
  código atrapa esa violación (SQLSTATE `23505`) FUERA de la transacción, porque
  después de un error la transacción queda abortada, y responde "ya tenés una
  reserva para este evento".
- **T5 necesita un destino.** Después de enviar, la persona tiene que ver hasta
  cuándo tiene el lugar y con qué token consultarlo. Se crea `/reservas/[token]`
  en versión mínima; T10 la completa como página de estado. Un formulario que no
  lleva a ningún lado no es software que funciona.
- **Criterios de aceptación:**
  (a) el formulario no deja pasar datos inválidos (Zod en el servidor, no solo
  atributos HTML);
  (b) con el último lugar libre, dos envíos simultáneos producen exactamente una
  reserva y un "no hay lugar" — probado con concurrencia real;
  (c) la misma persona no puede tener dos reservas activas en el mismo evento;
  (d) `npx tsc --noEmit` y `npm run build` limpios.
- **Verificación:** `scripts/verify-concurrency.mjs` dispara reservas en paralelo
  contra la base real. La aserción la fija el orquestador (capacidad 1, 8
  intentos, exactamente 1 éxito), y el orquestador vuelve a correr el script por
  su cuenta. Un test que se escribe solo no se cree solo.
- Pendiente nuevo: **P8** — falta el alias real de MercadoLibre para que la
  pantalla de confirmación muestre el dato de pago. Se lee de una variable de
  entorno, así que no bloquea el desarrollo.
- Pendientes que bloquean tareas: **P4** (cómo se sube el comprobante, por el límite de 1 MB de las Server Actions) bloquea **T6**, y conviene resolverlo antes de llegar. **P2** (página de estado por token) corresponde a **T10**.

### T8 — CRUD de eventos (decisiones y verificación)

- **Alcance:** crear, editar, publicar y despublicar eventos desde el panel. Lista en `/admin/eventos`, alta en `/admin/eventos/nuevo`, edición en `/admin/eventos/[id]`. La UI y las Server Actions viven bajo el route group `(panel)`, que ya exige sesión (layout + proxy).
- **Sin borrar evento en v1.** Las FKs son `ON DELETE RESTRICT`: borrar un evento con reservas falla en la base. T8 no borra; si hiciera falta, sería una tarea aparte con su propia regla (¿qué pasa con las reservas?).
- **Imagen del evento: diferida.** La columna `image_url` existe en el schema pero **hoy no se renderiza en ningún lado** del catálogo público. Agregar un campo de URL para una dueña no técnica es peor que no tenerlo. Se registra como **P9** (cómo sube la imagen) y T8 no expone imagen.
- **Precio como string.** `numeric` nunca pasa por float. El form recibe texto y el schema Zod valida decimal.
- **Guardia de capacidad (misma familia que R1):** al editar, no se puede bajar `capacity` por debajo de los cupos ya ocupados. El conteo de ocupados va en **SQL** (mismo predicado de cupo que `events.ts`, con el timer de `pending_no_receipt` evaluado en `now()`), no en un `if` de aplicación. Bajar la capacidad dejaría cupos negativos en el catálogo.
- **Publicar/despublicar** setea `is_published`. Despublicar **no** toca reservas: solo lo saca del catálogo público.
- **Validación:** un Zod schema por formulario en `src/lib/event-schema.ts`, validado en el servidor. Campos: `title` (req), `theme`, `description`, `location`, `startsAt`/`endsAt` (req, instantes; `endsAt > startsAt`), `capacity` (entero > 0), `price` (decimal > 0), `isPublished`.
- **Acceso a datos:** se extiende `src/lib/events.ts` (ya existe, hoy solo lectura pública) con las operaciones de administración.
- **Criterios de aceptación:**
  (a) no se crea ni edita con datos inválidos (Zod en el servidor, no solo atributos HTML);
  (b) crear un evento publicado lo hace aparecer en el catálogo público;
  (c) despublicar lo saca del catálogo **sin** tocar sus reservas;
  (d) no se puede bajar la capacidad por debajo de los cupos ocupados — probado contra la base real;
  (e) `npx tsc --noEmit` y `npm run build` limpios.
- **Verificación:** contra la base/servidor real (filas y status codes), no leyendo archivos.
- **Ruta de trabajo: delegada.** Escritura: un writer (≥5 archivos nuevos: schema Zod, capa de datos, 3 páginas + actions). Verificación: un verificador **independiente** (contexto fresco) ejecutó `scripts/verify-events-admin.mjs` contra la base real, exit 0, e intentó falsificar el guard en vez de creerle. De paso detectó que el enunciado original del escenario 3 era contradictorio (pedía rechazar `capacity 2` con 1 ocupado, que no está por debajo) y lo corrigió a una violación real.
- **Evidencia de verificación:** `node scripts/verify-events-admin.mjs` → `RESULT: PASS`, exit 0; `npx tsc --noEmit` exit 0; `npm run build` exit 0. La base quedó con los mismos conteos de filas antes y después (assert en el script).
- **Estado de la revisión nativa (RDD):** la revisión 4R del slice T5–T7 quedó **bloqueada por un problema de la herramienta** (auth del free tier de OpenCode en las sesiones del review → `provider_failed`), determinista y reproducible. El usuario eligió **deshabilitar RDD en este clon** (`gentle-ai review mode disable --scope clone`) y **abandonar** la transacción congelada. Desde acá T8–T12 avanzan bajo política normal.

### T9 — Gestión de reservas (decisiones antes de escribir código)

- **Alcance:** lista de reservas con filtros (por evento y por estado), detalle de una reserva, ver el comprobante, aprobar y rechazar. Lista en `/admin/reservas`, detalle en `/admin/reservas/[id]`, bajo el route group `(panel)`.
- **Aprobar:** `pending_review → approved`. El cupo ya estaba retenido desde `pending_review`, así que no cambia ningún conteo.
- **Rechazar:** `pending_review → rejected`, con `rejection_reason` (opcional) y `resolved_at = now()`. **La liberación del cupo es automática**: el predicado de cupos solo cuenta `pending_review`/`approved`, así que al pasar a `rejected` el lugar deja de estar ocupado. No se resta nada a mano — mismo criterio que R1, donde la base decide, no un `if`.
- **Solo se aprueba/rechaza lo que está en `pending_review`.** Una reserva sin comprobante (`pending_no_receipt`) **no** se aprueba: todavía no pagó. La condición va en el `WHERE` del `UPDATE` (`status = 'pending_review'`), así que un doble clic o dos pestañas no aplican la transición dos veces; si no matchea ninguna fila, se informa en vez de fingir éxito.
- **Ver el comprobante:** el bucket es privado, así que el detalle pide una **URL firmada** (`createSignedReceiptUrl`) al renderizar. No se guarda ni se comparte el link, y sin `receipt_path` la pantalla no se rompe.
- **Datos sensibles:** el detalle muestra la condición de salud (la dueña la necesita para organizar). Queda dentro del panel autenticado y no aparece en ningún listado público.
- **Vencimiento:** T9 **no** calcula vencimientos; muestra el estado guardado. La pantalla de vencimiento/seguimiento es T10.
- **Id inválido o inexistente → `notFound()`**, nunca 500.
- **Criterios de aceptación:**
  (a) aprobar pasa a `approved` y **no** libera cupo (el lugar sigue ocupado);
  (b) rechazar pasa a `rejected` y **sí** libera cupo — probado contando lugares libres antes y después;
  (c) aprobar/rechazar algo que no está en `pending_review` no cambia nada;
  (d) la lista filtra por evento y por estado;
  (e) el comprobante se ve con URL firmada; sin comprobante no se rompe;
  (f) `npx tsc --noEmit` y `npm run build` limpios.
- **Verificación:** contra la base real, con un script al estilo `verify-events-admin.mjs` que además limpie lo que crea.
- **Ruta de trabajo: delegada** (writer, ≥5 archivos: capa de datos, 2 páginas, actions, form de rechazo).

### T10 — Vencimiento y seguimiento (decisiones antes de escribir código)

- **El problema, concreto.** `/reservas/[token]` decide qué mostrar con el estado **guardado** (`isHeld = status === "pending_no_receipt"`). Una reserva así cuyo `expires_at` ya pasó sigue mostrando "Te guardamos el lugar" y una fecha límite que ya venció, **aunque el cupo ya se liberó solo** (el predicado de cupos la deja de contar cuando vence). La página miente. La lista del panel tiene el mismo problema al revés: esa fila se ve como "Pendiente de comprobante", y filtrar por "Expirada" no devuelve nada.
- **La regla, una sola vez.** Se exporta desde `src/lib/reservations.ts` una expresión SQL `effectiveStatusSql`:
  `case when status = 'pending_no_receipt' and (expires_at is null or expires_at <= now()) then 'expired' else status end`.
  Es el **espejo exacto** del predicado de cupos (`pending_no_receipt` ocupa solo mientras `expires_at > now()`), la evalúa el reloj de la base (el mismo que cuenta cupos) y `pending_review`/`approved` **no** vencen por timer. **No se escribe una segunda versión de esta regla en JavaScript.** Todo lo que muestre o filtre un estado usa esta expresión.
- **Superficies que la usan:** (1) `listReservationsForAdmin` proyecta `effectiveStatus` y **filtra** por él, no por `status`; (2) `getReservationForAdminById` proyecta `effectiveStatus` y el detalle muestra ese; (3) `getReservationByToken` proyecta `effectiveStatus` y devuelve además los datos de transferencia y `eventId` que la página pública ya renderiza; (4) las dos Server Actions de `/reservas/[token]/actions.ts` que hoy comparan `expiresAt` en JavaScript contra `Date.now()` dejan de hacerlo: piden `effectiveStatus` en el `SELECT` y deciden con eso.
- **La página pública deja de mentir y distingue cada estado** (hoy todo lo que no es retención o revisión cae en un texto genérico):
  - `pending_no_receipt` → retención + fecha límite + alias de pago + subida del comprobante (lo que ya hace);
  - `pending_review` → "en revisión" + datos declarados (lo que ya hace);
  - `approved` → "Tu reserva está confirmada", sin bloque de pago;
  - `rejected` → "No pudimos confirmar tu pago" + el motivo **si la dueña escribió uno** (`rejection_reason`);
  - `expired` → "El plazo venció y el lugar se liberó", con un enlace de vuelta al evento para reservar de nuevo. **Este es el caso que hoy miente.**
  - `cancelled` → "La reserva fue cancelada".
- **Una sola consulta.** Hoy la página llama a `getReservationByToken` y después hace un `select()` crudo duplicado sobre la misma fila. Se elimina la segunda consulta: `getReservationByToken` devuelve todo lo que la página necesita, **solo los campos que la página muestra** (nada de `select()` completo que arrastre la condición de salud a un render público).
- **La condición de salud nunca llega a la página pública.** Es un dato sensible (Ley 25.326) y esta página se abre con un token, sin login. El detalle del panel la sigue mostrando; acá no se selecciona.
- **Sin tarea en segundo plano ni cron.** El vencimiento se **calcula al leer** con el reloj de la base: nadie corre un job y el cupo se libera solo (R3). Pero hay un caso en el que el estado **sí se materializa**, y es un defecto que hay que corregir acá: cuando la persona vuelve a intentar reservar el mismo evento, el índice único parcial `reservations_active_per_person_unique` todavía la cuenta como activa — su `WHERE` mira el estado **guardado**, y el estado guardado sigue siendo `pending_no_receipt` — así que `createReservation` responde "ya tenés una reserva" **para siempre**, con el cupo libre. Contradice el comentario del propio índice en `src/db/schema.ts` ("a rejected or expired reservation does not block a new attempt"). Se corrige materializando el vencimiento **dentro de la misma transacción de `createReservation`**, después del upsert del cliente y antes del insert: `UPDATE reservations SET status = 'expired', updated_at = now() WHERE event_id = ... AND customer_id = ... AND status = 'pending_no_receipt' AND (expires_at IS NULL OR expires_at <= now())`. Es seguro porque la transacción ya tiene la fila del evento con `FOR UPDATE`, así que los intentos sobre el mismo evento están serializados; es idempotente; y **no cambia ningún conteo de cupos**, porque esa fila ya no contaba. Así el índice vuelve a morder solo donde tiene que morder, y `expired` deja de ser un valor del enum que nunca se alcanza. **No hay migración**: el predicado del índice no cambia.
- **El enlace de vuelta al evento de la página pública, entonces, sí funciona.** Sin esa corrección la página prometía algo que la base bloqueaba. La acción "reservar de nuevo" es la misma de siempre: no se agrega ningún camino nuevo de reserva.
- **Criterios de aceptación:**
  (a) una `pending_no_receipt` con `expires_at` en el pasado se muestra **vencida** y **no** como retención activa, ni en la página pública ni en el panel;
  (b) una `pending_no_receipt` dentro del plazo se sigue mostrando como retención activa con su fecha límite;
  (c) `pending_review` **no** vence aunque su `expires_at` haya quedado viejo (hoy se limpia a `null` al subir el comprobante, pero la regla no depende de eso);
  (d) el filtro por estado del panel devuelve las vencidas al filtrar "Expirada", y el badge coincide con lo que devuelve el filtro;
  (e) `approved`, `rejected` (con motivo) y `cancelled` se distinguen entre sí en la página pública;
  (f) un token inexistente o mal formado sigue dando `notFound()`, nunca 500;
  (g) `npx tsc --noEmit` y `npm run build` limpios;
  (h) una persona cuya retención venció **puede volver a reservar el mismo evento** — probado llamando a `createReservation` dos veces con la retención vencida en el medio y observando `{ ok: true }` en la segunda;
  (i) R1 sigue mordiendo y la concurrencia sigue dando exactamente un ganador: `scripts/verify-constraints.sql` y `scripts/verify-concurrency.mjs` siguen pasando **después** de la corrección.
- **Verificación:** contra la base real, con `scripts/verify-reservations-expiry.mjs` al estilo de los scripts anteriores (Node 24 + resolver del alias `@/`, importa el módulo real, limpia lo que crea y compara conteos). Escenarios: vencida vs vigente con el **mismo** estado guardado; `pending_review` vieja que no vence; filtro "Expirada" del panel; que `getReservationByToken` **no** exponga `conditionDetails`; y la re-reserva tras el vencimiento. Más los dos scripts que ya existían para el área más delicada del proyecto, porque la corrección toca la transacción de creación: `scripts/verify-constraints.sql` (R1) y `scripts/verify-concurrency.mjs`.
- **Ruta de trabajo: delegada** (writer: capa de datos en `reservations.ts`, la página pública, 2 actions, la lista y el detalle del panel). Verificación con verificador **independiente**.

### T11 — WhatsApp de 1 toque (decisiones antes de escribir código)

- **Qué es:** en el **detalle** de una reserva (panel admin) aparece un botón "Contactar por WhatsApp" que abre `wa.me` con un mensaje **pre-armado según el estado efectivo** de la reserva. La dueña lo toca, revisa/edita el texto y lo envía. Es una comunicación **manual y humana**, no automática: nadie manda nada desde el servidor, no hay historial, no hay Twilio.
- **La dirección WhatsApp → dueña no entra en T11.** No hay ningún número de la organización configurado en el código (solo `PAYMENT_ALIAS` para la transferencia), así que el botón "de cliente a casa" quedaría con un deep link roto. Si la dueña quiere eso, es una tarea aparte que necesita una variable de entorno suya (p. ej. `VENUE_WHATSAPP`). T11 solo abre chat con la **persona que reservó**.
- **El número se guarda como texto libre** (`varchar(32)`, sin validación de formato en `reservation-schema.ts`), así que el deep link necesita una normalización **tolerante pero acotada**, documentada como "best effort":
  1. quedarse solo con dígitos;
  2. `00...` al inicio → quitar el prefijo internacional; `0...` al inicio → quitar el cero de troncal nacional; `15...` al inicio (formato móvil viejo) → quitar el `15`;
  3. si no arranca con `54`, anteponer `54`;
  4. si el resultado no tiene 12 o 13 dígitos (5411 + 8, o 549 + área + número), **no es un número plausible** → el deep link es `null` y la página muestra una nota "el número no tiene un formato que WhatsApp pueda abrir" en vez de un botón roto. La página ya muestra el número crudo en "Datos del cliente", así que la dueña lo ve y lo corrige en la ficha de contacto.
- **El mensaje se arma con una función pura** `buildReservationWhatsAppMessage(...)` en `src/lib/whatsapp.ts` (nuevo), que recibe un objeto explícito (nada de leer env por dentro): nombre (se saluda con el primer nombre), título y fecha del evento, precio, fecha límite de la retención, motivo de rechazo, alias de pago (o `null`) y estado efectivo. Mensajes por estado, en español, cálidos y sin emojis:
  - `pending_no_receipt` (vigente): "¡Hola [Nombre]! Te guardamos el lugar para [Evento] el [fecha]. Para confirmarlo, transferí [precio] al alias [alias] antes del [fecha límite]. Pasado ese plazo el lugar se libera solo. ¡Cualquier cosa, escribinos!"
  - `pending_review`: "¡Hola [Nombre]! Ya recibimos tu comprobante para [Evento]. Lo estamos revisando y en breve te confirmamos. ¡Gracias!"
  - `approved`: "¡Hola [Nombre]! Tu reserva para [Evento] el [fecha] está CONFIRMADA. Te esperamos. ¡Gracias!"
  - `rejected`: "¡Hola [Nombre]! No pudimos confirmar tu reserva para [Evento]. [Motivo si existe]. Si querés, escribinos y vemos cómo ayudarte."
  - `expired`: "¡Hola [Nombre]! Se venció el plazo para tu reserva de [Evento] y el lugar se liberó. Si todavía querés venir, avisanos y vemos si quedan lugares."
  - `cancelled` y cualquier caso no esperado: un mensaje genérico de contacto.
  Un `switch` exhaustivo sobre el enum; el mensaje del alias dice "al alias que te pasamos por este chat" si `paymentAlias` es `null`.
- **El link se arma con** `buildWhatsAppDeepLink(phone, message)`: `https://wa.me/<digits>?text=<encodeURIComponent(message)>`, o `null` si el teléfono es inválido. La página solo dibuja el botón cuando el link no es `null`.
- **La UI:** una sección "Contactar por WhatsApp" debajo de "Datos del cliente", con un `<a>` con estilo de botón secundario (`target="_blank" rel="noopener noreferrer"`) y un texto corto que avisa que abre la app con el mensaje pre-armado. No hace falta componente cliente: es un enlace.
- **Criterios de aceptación:**
  (a) el botón aparece en el detalle con su mensaje según el estado efectivo;
  (b) el deep link abre el chat con el número normalizado y el texto con la codificación correcta (el parámetro decodificado es EXACTAMENTE el mensaje);
  (c) un número inválido/rarísimo no produce un link roto: `null` y nota visible;
  (d) `npx tsc --noEmit` y `npm run build` limpios.
- **Verificación:** `scripts/verify-whatsapp.mjs` importa las funciones REALES (no toca la base: son puras) y prueba la tabla de normalización (11-XXXX, 011-XXXX, +54 9 11 ..., 54911..., 15-XXXX, 00..., inválidos de 6 dígitos, letras y espacios), el round-trip de la codificación del mensaje, y que cada estado produzca el mensaje esperado (contiene el nombre, el evento y, en rechazo, el motivo). RED primero: las funciones no existen → el import falla.
- **P3 queda parcialmente respondido:** rechazar sigue sin "enviar" nada automático, pero ahora la dueña tiene el mensaje de rechazo a un toque, editable. Si más adelante se quiere el aviso automático (mail/Twilio), es una tarea aparte.
- **Ruta de trabajo: delegada** (writer: `src/lib/whatsapp.ts` nuevo + el detalle + script).

### T12 — Clientes y exportación (decisiones antes de escribir código)

- **Qué es:** página `/admin/clientes` con el listado de clientes (datos de contacto + qué reservaron) y export a CSV desde el panel. Es la base de contactos de la dueña: hoy los clientes solo "existen" dentro de la lista de reservas.
- **Modelo de datos del listado (una fila por cliente, con agregados sobre `reservations`):**
  - nombre, email, WhatsApp (lo que la dueña usa con el botón de T11);
  - **reservas totales** = `count(*)` de sus reservas;
  - **reservas activas** = el MISMO predicado de cupos del sistema, evaluado con `effectiveStatusSql` para que el timer cuente: `count(*) filter (where effectiveStatusSql in ('pending_no_receipt','pending_review','approved'))` — los literales son exactamente `OCCUPYING_STATUSES` de `schema.ts` (importarlo y usarlo como lista segura);
  - **última reserva** = `max(reservations.created_at)`.
  - Orden: actividad más reciente primero (`max(created_at) desc`).
- **Búsqueda:** un solo campo libre sobre la query string (`?search=`), mismo patrón servidor que la lista de reservas (`form method="get"` + `parseAdminClientFilters` en `src/lib/reservation-admin-schema.ts`): matchea nombre, email o WhatsApp con ILIKE. **Escaping obligatorio** de `\`, `%` y `_` en el término (un `%` tipeado no puede listar a todos) y el término viaja como parámetro SQL, nunca interpolado crudo. Un valor inválido se IGNORA (nunca 500), igual que los filtros de reservas (patrón `.catch(undefined)`).
- **Export CSV:** enlace "Exportar CSV" que conserva la búsqueda activa (`/admin/clientes/export?search=...`). El handler es un **route handler** (`src/app/admin/(panel)/clientes/export/route.ts`) porque:
  - **no pasa por el layout del panel** (los route handlers no se envuelven en layouts) → defensa en profundidad propia: `getAdminSession()` dentro del handler y redirect a `/admin/login` si no hay sesión (el proxy de borde ya es la puerta principal; esto cubre en el handler el mismo hueco que el layout cubre en las páginas);
  - reusa `parseAdminClientFilters` + `listClientsForAdmin`: el export respeta EXACTAMENTE el filtro actual de la página;
  - formato: **UTF-8 con BOM** (`\uFEFF` al inicio) + **CRLF** (Excel abre bien acentos y saltos); columnas: Nombre, Email, WhatsApp, Reservas totales, Reservas activas, Última reserva (fechas con `formatDateTime`);
  - headers: `Content-Type: text/csv; charset=utf-8` y `Content-Disposition: attachment; filename="clientes-<fecha>.csv"` (fecha del día en ASCII);
  - la generación es la función pura `toClientsCsv(rows)` en `src/lib/clients.ts`, testeable sin base: **siempre entrecomillar** los campos (comillas dobles internas duplicadas `"` → `""`) y `\r\n` de cierre.
- **Privacidad (Ley 25.326):** la condición de salud NO entra ni en el listado ni en el CSV (la lista de reservas ya no la muestra; pertenece al detalle). Tampoco entra `marketing_consent`.
- **Nuevo módulo `src/lib/clients.ts`:** tipo `AdminClientListItem`, `listClientsForAdmin({ search })` (`import { db } from "@/db"`, schema de `@/db/schema`, `effectiveStatusSql` de `@/lib/reservations` — sin modificar reservations.ts) y `toClientsCsv(rows)`.
- **Dashboard:** tercer card en `src/app/admin/(panel)/page.tsx` enlazando a `/admin/clientes`.
- **Criterios de aceptación:**
  (a) el listado muestra nombre/email/whatsapp + totales + última reserva, ordenado por actividad;
  (b) la búsqueda matchea nombre, email o whatsapp, ignora términos inválidos, y `%`/`_` literales NO filtran todo;
  (c) el CSV con BOM/CRLF escapa comas/comillas/saltos, respeta el filtro activo, y el export exige sesión (sin sesión: redirect al login, nunca datos);
  (d) `npx tsc --noEmit` y `npm run build` limpios.
- **Verificación:** `scripts/verify-clients.mjs` (base real + resolver de alias como los scripts previos): crea 2 clientes de prueba con reservas conocidas (eventos DISTINTOS por cliente para no pisar R1), compara los agregados contra un oráculo SQL independiente (estado guardado + timer), prueba la búsqueda por fragmento de nombre/email/whatsapp y `%`/`_` literales, el CSV puro con casos sucios, y deja la base con los mismos conteos (borra lo que crea). RED primero. R1 y concurrencia NO se re-corren: T12 no toca ni el esquema ni la transacción de creación.
- **Ruta de trabajo: delegada** (writer: `src/lib/clients.ts` + `parseAdminClientFilters` + página + route handler + card del dashboard + script de verificación).
