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
- [ ] **T8 CRUD de eventos** — crear, editar, publicar y despublicar desde el panel.
- [ ] **T9 Gestión de reservas** — lista con filtros, ver comprobante, aprobar y rechazar con liberación de cupo.
- [ ] **T10 Vencimiento y seguimiento** — cálculo de expiración y página pública de estado por token.
- [ ] **T11 WhatsApp 1 toque** — botón con deep link y mensaje pre-armado.
- [ ] **T12 Clientes** — listado y exportación.

## Estrategia de entrega

- Commit por unidad de trabajo, en la rama de la feature. **El repositorio lo maneja el usuario: el agente no hace commit ni push.**
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
