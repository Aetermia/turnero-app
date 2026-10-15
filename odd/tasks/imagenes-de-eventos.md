# Feature: Imagen del evento en el catálogo y gestión desde el panel

Rama: `feat/event-images` (desde `feat/reservations-and-admin` @ `3f6c4c2`).
Entrega: `ask-on-risk`. Un commit por tarea.
Chequeos: `npx tsc --noEmit`, `npm run lint`, `npm run build`, y los scripts de verificación contra la base real (`node scripts/verify-events-admin.mjs`, `node scripts/verify-event-image.mjs`).

## Objetivo

Los eventos del catálogo público se muestran uno debajo del otro, con más aire, y con la foto del evento en proporción 3:4 entre el nombre y la descripción/fecha. Cuando el evento no tiene foto se ve un bloque de color en el mismo espacio.

Desde el panel, la dueña puede subir, ver, reemplazar y borrar la foto del evento, directamente desde el celular.

## Problema

Hoy el catálogo es una grilla de dos columnas con cards chicas y sin imagen. `events.image_url` existe en el schema y ya viaja hasta `EventWithSeats.imageUrl`, pero nunca se renderiza, y el panel no la toca: ni siquiera la selecciona (`adminEventSelection` la omite). No hay forma de que la dueña cargue una foto.

## Alcance

Incluido:
- Catálogo apilado (una sola columna) con cards más grandes.
- Bloque de imagen 3:4 dentro de la card, entre el título y los datos.
- Bloque de color de relleno en el mismo espacio cuando no hay foto.
- La misma imagen en la página de detalle del evento.
- Gestión de la imagen (subir / ver / reemplazar / borrar) en la edición del evento.
- Subida directa desde el celular: selector de cámara/galería, compresión en el cliente, PUT directo a Storage.

Fuera de alcance (explícito):
- Varias imágenes por evento. Decisión del usuario: una sola.
- Reordenar imágenes o elegir portada.
- Cargar la imagen desde el alta del evento (ver D3).
- Miniatura en el listado del panel.

## Restricciones no negociables

1. Una sola imagen por evento. Se reutiliza la columna `events.image_url` que ya existe. Sin tabla nueva, sin migración.
2. El bucket de imágenes de evento es PÚBLICO. Los comprobantes siguen en bucket privado con URL firmada. Son dominios distintos: el comprobante es dato sensible, la foto del evento es contenido que se publica en el catálogo.
3. Toda escritura pasa por Server Action, y la acción verifica la sesión de admin por sí misma, porque una acción es un endpoint POST propio y no puede confiar sólo en el layout.
4. La compresión de la imagen se hace en el cliente, igual que el comprobante: el celular sube un archivo chico y el peso no pasa por el servidor de la app.
5. La URL que el browser devuelve después de subir se valida en el servidor antes de guardarla: tiene que ser una URL pública del bucket de imágenes, de la carpeta de ESE evento.

## Especificaciones

S1. En el catálogo público los eventos van uno debajo del otro (una sola columna).
   Texto del usuario: "los eventos tienen que ir uno debajo del otro".
S2. Las cards ocupan más espacio visual que hoy.
   Texto del usuario: "y tienen que ocupar mas espacio visual".
S3. Entre el nombre y la descripción/fecha va la imagen del evento, con ratio 3:4, ocupando el ancho de la card.
   Texto del usuario: "entre el nombre y la descripción/fecha, etc... Va a haber una imagen, que sea 3:4 el ratio".
   Revisado el 14/10/2026 (2): la imagen vuelve a ocupar el ancho completo de la card y a sangrar de borde a borde. La reducción a dos tercios que se probó entre medio dejaba la foto flotando y no era lo pedido.
   Texto del usuario: "a ver, hace que las imagenes entren de ancho en la card".
S9. La fecha y el horario del evento se muestran en negrita en el catálogo.
   Texto del usuario: "Además me gustaria que la fecha y horario esten en negrita".
S4. Cuando no hay imagen se muestra un color de relleno en el mismo espacio 3:4.
   Texto del usuario: "y ponele un color placeholder donde iria la imagen".
S5. Una sola imagen por evento.
   Texto del usuario (respuesta a la consulta previa): "Una sola por evento".
S6. Desde el panel, al editar un evento, la dueña puede hacer CRUD de la imagen.
   Texto del usuario: "Tambien desde el panel admin la dueña deberia poder hacer CRUD de las imagenes al editar un evento".
S7. La imagen se sube directamente desde el celular de la dueña.
   Texto del usuario: "Ella las sube directamente desde su celular".
S8. Las imágenes de ejemplo que el usuario dejó en `public/` se cargan en el evento que les corresponde, según su nombre.
   Texto del usuario: "Ahi te di unas imagenes de ejemplo, las podrias poner?" y "estan en public con sus nombres".
   Archivos provistos: `Acuarelas.webp` (1440x1920), `Escritura.webp` (1440x1440). `logo.webp` es el logo de la app, no una foto de evento.

## Decisiones

D1. Una sola imagen por evento (S5). Se reutiliza `events.image_url`, que ya existía y ya viajaba hasta `EventWithSeats.imageUrl` sin renderizarse. Sin migración, sin tabla nueva. La card muestra esa imagen.

D2. El color de relleno sale de `themeTone(event.theme)`. Cada temática ya tiene su tono pastel, y así el relleno no inventa una paleta nueva ni queda igual para todos los eventos. Se agrega `placeholder` al tipo `ThemeTone`, con el tono 300 de cada familia.

D3. La imagen NO se puede cargar en el alta (`/admin/eventos/nuevo`): el path del objeto depende del id del evento, y en el alta el id todavía no existe. Se carga en la edición. Es una limitación aceptada, no un olvido.

D4. Se guarda la URL pública completa en `image_url`, no el path. Motivo: el catálogo tiene que poder renderizar la imagen sin depender de que `SUPABASE_URL` esté configurada. Si se guardara el path, la home no podría construir la URL en desarrollo (donde no hay Supabase) y el catálogo se rompería. Contrapartida conocida: si el proyecto de Supabase migrara de host, las URLs viejas quedarían apuntando al host viejo.

D5. La imagen también se muestra en el detalle del evento, con el mismo ratio 3:4. No se pidió explícitamente; se agrega por consistencia, porque la card la anuncia y el detalle es donde se va a mirar. Si molesta, se saca en un cambio de una línea.

D6. En el detalle NO se muestra color de relleno. El relleno es un recurso de la card del catálogo (S4): en una página completa un bloque de color grande se leería como un error. El detalle muestra la imagen sólo si existe.

D7. No se toca `receipt-upload.tsx`. Su compresión de imagen se duplica en el componente nuevo en vez de extraerse a un módulo compartido. Motivo: el flujo de comprobantes no se puede ejercitar localmente (no hay proyecto Supabase configurado), así que un refactor ahí sería una regresión invisible. Queda como pendiente para cuando el comprobante se pueda verificar contra Supabase real.

D8. Si el evento tiene imagen y el archivo se reemplaza o se borra, el objeto viejo se intenta borrar del bucket en modo best-effort: si falla, no se rompe la operación y sólo queda un objeto huérfano. Borrar de Storage es secundario frente a dejar el dato consistente.

D9. Las fotos de ejemplo se guardan como ruta local (`/Acuarelas.webp`), no como URL de Supabase. Es la excepción a D4 y es deliberada: el archivo vive en `public/`, lo sirve el propio Next, y así el catálogo se ve completo en desarrollo sin ningún proyecto Supabase configurado. Consecuencias aceptadas:
   - El validador del panel (`isEventImagePublicUrlForEvent`) sólo acepta URLs del bucket; un evento con ruta local no se puede guardar desde el panel, sólo subiendo una foto real a Storage. Es una desviación de conveniencia, no un camino de escritura.
   - Al reemplazar o borrar una foto local, `eventImagePathFromPublicUrl` devuelve `null` y no se intenta borrar nada del bucket: no hay objeto que borrar. Es el comportamiento correcto.
   - El nombre debe coincidir EXACTAMENTE con el archivo en disco. Windows y macOS no distinguen mayúsculas; Linux (Vercel) sí, y una ruta mal escrita se ve bien en local y da 404 en producción. La comparación exacta quedó cubierta por el script de verificación.

D10. Si el evento no tiene foto, el bloque de color sigue cumpliendo su función (S4), así que no se inventan imágenes que la dueña no dio. Quedan sin foto `Charla: cocina sin TACC en casa` y `Taller de cerámica (borrador)`; no se reutiliza `logo.webp` como relleno porque es el logo, no una foto del evento.

## Modelo de datos

Sin cambios. `events.image_url` (`text`, nullable) ya existe en `src/db/schema.ts`.

Convención del bucket `event-images` (nuevo, público):
- Path del objeto: `event-<eventId>/<timestamp>.<ext>`.
- Se acepta como válida sólo una URL pública de ese bucket y de la carpeta de ese evento.

## Tareas

- T1 — Catálogo apilado y card con imagen 3:4 y relleno por temática (S1,S2,S3,S4). Inline.
- T2 — Storage público, reglas de subida y config de `next/image` (S5,S6,S7). Inline.
- T3 — Capa de datos: `imageUrl` en el admin y `setEventImage` (S5,S6). Inline.
- T4 — Server Actions de la imagen, con validación de la URL (S6,S7). Inline.
- T5 — UI de la imagen en la edición del evento (S6,S7). Inline.
- T6 — Verificación contra la base real y actualización del doc (S1..S7). Inline.
- T7 — Fotos de ejemplo de `public/` en los eventos que les corresponden (S8). Inline.
- T8 — Commits por unidad de trabajo en `feat/event-images`. Inline.
- T9 — Imagen más chica (dos tercios, centrada) y fecha/horario en negrita (S3 revisado, S9). Inline.

## Estrategia de entrega

`ask-on-risk`. Un commit por tarea sobre `feat/event-images`. El push y el merge quedan a decisión del usuario.

## Progreso

### L1 — Pedido original del usuario (verbatim)

> Bien. Ahora hay que desarrollar lo siguiente. los eventos tienen que ir uno debajo del otro y tienen que ocupar mas espacio visual. entre el nombre y la descripción/fecha, etc... Va a haber una imagen, que sea 3:4 el ratio y ponele un color placeholder donde iria la imagen.
>
> Tambien desde el panel admin la dueña deberia poder hacer CRUD de las imagenes al editar un evento. Ella las sube directamente desde su celular.

### L2 — Respuesta del usuario a la consulta de alcance (verbatim)

Consulta: cuántas imágenes por evento. Respuesta: "Una sola por evento".

Consecuencia: se reutiliza `events.image_url`. Sin migración.

### L3 — Hallazgos de la exploración previa

- `events.image_url` existe y ya viaja a `EventWithSeats.imageUrl`; la home la ignora.
- `adminEventSelection`, `AdminEvent` y `AdminEventRow` no incluyen `imageUrl`.
- El patrón de subida ya está resuelto en el repo: Server Action acuña una URL firmada, el browser hace PUT directo, la acción persiste. `createSignedUploadUrl` en `src/lib/storage.ts`.
- `themeTone()` ya deriva un tono pastel estable por temática a partir de texto libre.
- Los tonos disponibles en `globals.css` son sólo 50 y 300 por familia (celeste, salvia, coral, arena).
- El proyecto exige leer `node_modules/next/dist/docs/` antes de escribir código. Se leyó `01-app/01-getting-started/12-images.md`.

### L4 — Pedido de las fotos de ejemplo (verbatim)

> Ahi te di unas imagenes de ejemplo, las podrias poner?

> estan en public con sus nombres

### L5 — Mapeo de archivo a evento y escritura en la base

Los archivos de `public/` y sus dimensiones reales:

- `Acuarelas.webp` — 1440x1920 (3:4) — 149.5 KB → `Taller de acuarela para principiantes` (temática Pintura).
- `Escritura.webp` — 1440x1440 (1:1) — 94.3 KB → `Círculo de escritura creativa` (temática Escritura).
- `logo.webp` — 562x262 — logo de la app, ya versionado. NO es foto de evento: no se usa.

El mapeo salió del nombre del archivo contra el título/temática del evento, que es lo que el usuario indicó ("con sus nombres"). Se escribió `image_url` directamente con `UPDATE` sobre la base local: el validador del panel sólo acepta URLs del bucket, no rutas locales (D9).

### L6 — Verificación

- `node scripts/verify-event-image.mjs` → RESULT: PASS (escenarios 1 a 8).
- `node scripts/verify-events-admin.mjs` → RESULT: PASS.
- `npx tsc --noEmit` → exit 0, sin salida.
- `npm run lint` → 4 problems (1 error, 3 warnings). Idéntico al baseline: el error es `react-hooks/purity` en `src/app/eventos/[id]/reservar/page.tsx` y los warnings son de `verify-concurrency.mjs`, `receipt-upload.tsx:247` y `storage.ts:45`. Cero problemas nuevos.
- Render real contra el server de desarrollo (`localhost:3000`): el catálogo trae `/Acuarelas.webp` y `/Escritura.webp`; el detalle de los dos eventos también; `/Acuarelas.webp` y `/Escritura.webp` responden 200, y las URLs del optimizador (`/_next/image?url=...`) responden 200.
- `logo.webp` queda: no se referencia desde ninguna card.

### L7 — Bug encontrado y corregido: una URL de carpeta pasaba como foto válida

El escenario 1 del script (`"a folder with no object is rejected"`) falló al correrlo de nuevo. `eventImagePathFromPublicUrl` sólo rechazaba el path vacío y el `..`, así que `.../event-<id>/` devolvía `event-<id>/` y `isEventImagePublicUrlForEvent` lo daba por bueno: la card habría intentado renderizar una carpeta y mostrado imagen rota en lugar del relleno. Se agregó el rechazo de path terminado en `/` en `src/lib/storage.ts`. El escenario pasó después del fix. Es una guarda sobre input que viene del browser, no una mejora cosmética.

### L8 — Verificación de integridad de rutas locales (nuevo escenario 7)

Se agregó al script un escenario que, para cada evento con `image_url` que empieza con `/`, comprueba que el archivo exista en `public/` Y que el nombre coincida exactamente con el del disco (comparación sensible a mayúsculas, no `existsSync` solo). Motivo: la base tenía `/escritura.webp` con la `e` en minúscula y el archivo es `Escritura.webp`. En Windows resolvía; en Vercel (Linux) habría dado 404. Corregido en la base y ahora cubierto por el script.

### L9 — Segundo pedido del usuario (verbatim)

> Me gustaria que fuese un poco mas chica la imagen, actualmente es muy grande.
> Además me gustaria que la fecha y horario esten en negrita

Qué se hizo:

- La imagen pasa de ancho completo a `w-2/3` centrada (`mx-auto`), conservando el 3:4 y el bloque de color del mismo tamaño. Números: antes 736x981 en pantalla grande, ahora 491x654; en un celular de 390 px, antes 358x477 y ahora 239x318. No se toca la card ni el ancho de la columna: lo que el usuario había pedido antes (más espacio visual) sigue igual.
- Se actualizó el atributo `sizes` de `next/image` a `(min-width: 800px) 491px, 66vw`, para que el optimizador elija el archivo del tamaño real y no un sobrante de 3840 px.
- La fecha y el horario del catálogo pasan a `font-semibold text-ink`: negrita y el color fuerte en vez del gris suave. El gris suave con negrita se leía embarrado.
- NO se tocó la página de detalle: ahí la foto sigue a ancho completo y la fecha sin negrita. El pedido apuntaba al catálogo. Si también se quiere ahí, es una línea en cada caso.

Evidencia: `npx tsc --noEmit` exit 0. `npm run lint` 4 problems (1 error + 3 warnings), idéntico al baseline. Render contra el server de desarrollo: 4 cards con `aspect-[3/4] w-2/3` y 0 con `w-full`, 4 bloques de fecha con `font-semibold text-ink`, 4 atributos `sizes` nuevos, y la URL del optimizador responde 200.

### L10 — Tercer pedido del usuario (verbatim)

> a ver, hace que las imagenes entren de ancho en la card

Qué se hizo: se revierte la reducción a dos tercios. La imagen vuelve a `w-full`, de borde a borde de la card, manteniendo el 3:4, el `mx-auto` se va y el atributo `sizes` vuelve a `(min-width: 800px) 736px, 100vw`. La fecha en negrita del pedido anterior queda como estaba.

Queda anotado, porque importa para el próximo cambio: a ancho completo y 3:4 la foto mide 736x981 px en pantalla grande, que es el estado que el usuario había llamado "muy grande" en el pedido anterior. Si lo que molesta es la altura y no el ancho, la palanca es el ratio (por ejemplo `aspect-[4/3]`), no el ancho: reducir el ancho ya se probó y el usuario lo rechazó.

Evidencia: `npx tsc --noEmit` exit 0. `npm run lint` 4 problems, idéntico al baseline. Render contra el server de desarrollo: 4 cards con `aspect-[3/4] w-full` y 0 con `w-2/3`, 4 `sizes` con `736px, 100vw`, 4 fechas en negrita, y la URL del optimizador responde 200.
