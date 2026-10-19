# Cómo subir el sitio a DonWeb (Plan Emprendedor)

Guía paso a paso para poner online la versión PHP + MySQL de Casa de Antón.
No hace falta Node, ni Vercel, ni Supabase, ni tareas programadas (cron).

> **Antes de empezar:** el Plan Emprendedor viene con WordPress preinstalado
> en `public_html`. Este sitio reemplaza a ese WordPress. Si el WordPress no
> se usa, se puede borrar; si tiene algo que importe, hacé primero una copia
> desde el panel de DonWeb.

---

## Paso 0 · Comprobar que el hosting alcanza (5 minutos)

1. Subí **solo** el archivo `tools/check-hosting.php` a `public_html`.
2. Abrí `https://TU-DOMINIO/check-hosting.php` en el navegador.
3. Tiene que estar todo en verde: PHP 8.1 o superior, las extensiones
   (`pdo_mysql`, `fileinfo`, `mbstring`, `json`, `session`) y un límite de
   subida de 9 MB o más.
4. Creá la base de datos (Paso 2), completá los 4 datos de la base al
   principio de `check-hosting.php` y volvé a abrirlo. Así se comprueban
   también la versión de MySQL/MariaDB, InnoDB y la regla de "una reserva
   activa por persona y evento".
5. **Borrá `check-hosting.php` cuando termines.** Muestra versiones del servidor.

**Si algo sale en rojo, frená acá.** No busques una solución por tu cuenta:
avisá antes de seguir, porque puede que el plan no alcance.

Si lo único en rojo es el límite de subida (`upload_max_filesize` o
`post_max_size`), probá esto antes de rendirte: creá en `public_html` un
archivo llamado `.user.ini` con estas dos líneas, esperá 5 minutos y volvé a
abrir el chequeo:

```
upload_max_filesize = 10M
post_max_size = 12M
```

## Paso 1 · Preparar el paquete (en tu computadora)

Desde la carpeta del proyecto:

```
php tools/make-deploy-zip.php
```

Eso crea `dist/casa-donweb-AAAAMMDD.zip` con todo lo necesario, ya ordenado.
No incluye contraseñas, comprobantes, sesiones, pruebas ni `node_modules`.

> Si en tu computadora no tenés PHP, pedile a Claude que arme el zip.

## Paso 2 · Crear la base de datos (panel de DonWeb)

1. En el panel: **Bases de datos → MySQL → Crear base**. Anotá el nombre de la
   base, el usuario y la contraseña.
2. Abrí **phpMyAdmin**, elegí la base nueva → pestaña **Importar** → elegí
   `database/schema.sql` (está dentro del zip) → **Continuar**.
3. Deberían aparecer 3 tablas: `events`, `customers` y `reservations`.

No cargues los eventos de ejemplo (`seed.php`) en el sitio real: la dueña
crea los eventos desde el panel.

## Paso 3 · Subir los archivos

En el **Administrador de archivos** (o por FTP), en la carpeta principal de la
cuenta, la que **contiene** a `public_html`:

1. Subí el zip y descomprimilo ahí mismo.
2. Tiene que quedar así:

```
(carpeta principal de la cuenta)
├── public_html/     ← lo único que se ve desde internet
├── app/             ← el código
├── config/          ← la configuración (contraseñas)
├── database/
├── storage/         ← comprobantes, sesiones y registros
└── tools/
```

`app/`, `config/` y `storage/` tienen que quedar **al lado** de
`public_html`, nunca adentro. Eso es lo que hace que los comprobantes y las
contraseñas no se puedan abrir desde el navegador.

3. Permisos: la carpeta `storage/` y sus subcarpetas (`receipts`,
   `sessions`, `logs`) tienen que permitir escritura (755 alcanza en la
   mayoría de los planes). Lo mismo `public_html/uploads/events/` (ahí se
   guardan las fotos de los eventos).

> **Sobre "Git integrado":** también se puede clonar el repositorio en el
> servidor, pero entonces la carpeta pública es `public/` (dentro del repositorio) y no
> `public_html`. Hasta saber si DonWeb permite cambiar la carpeta pública, el
> camino seguro es el zip.

## Paso 4 · Configurar (`config/config.php`)

1. En `config/`, copiá `config.example.php` con el nombre `config.php`.
2. Editá `config.php` y completá:
   - `'db'`: el nombre de la base, el usuario y la contraseña del Paso 2
     (`host` casi siempre es `localhost`).
   - `'payment_alias'`: el alias de Mercado Pago, por ejemplo
     `'casa.de.anton.mp'`.
   - `'admin' => 'user'`: el usuario del panel.
   - `'admin' => 'password_hash'`: **no** se pone la contraseña, sino su
     "hash". Se genera con:
     ```
     php tools/hash-admin-password.php "la-contraseña-del-panel"
     ```
     y se pega la línea que imprime. Usá 10 caracteres o más. Si no tenés
     PHP en tu computadora, pedile a Claude que genere el hash.
   - Dejá `'env' => 'production'`.
3. `config.php` **nunca** va al repositorio (ya está en `.gitignore`).

Mientras el hash esté vacío o sea inválido, el panel no deja entrar a nadie:
falla cerrado, a propósito.

## Paso 5 · HTTPS (obligatorio)

Activá el **certificado SSL gratis** desde el panel y forzá HTTPS. En
producción la cookie de sesión solo viaja por HTTPS: sin certificado, el
login del panel no se mantiene.

## Paso 6 · Comprobaciones en el servidor real

Hacelas una por una:

1. `https://TU-DOMINIO/` muestra el catálogo (vacío al principio).
2. `https://TU-DOMINIO/admin` lleva al login. Entrá con el usuario y la
   contraseña del Paso 4.
3. Creá un evento de prueba desde el panel, con foto, y publicalo.
4. Desde el celular: reservá, subí un comprobante (una foto) y completá los
   datos de la transferencia.
5. En el panel: la reserva aparece "En revisión", se ve el comprobante, se
   aprueba y la página de la persona dice "Tu reserva está confirmada".
6. **Bloqueo de la carpeta de fotos:** subí a `public_html/uploads/events/`
   un archivo `prueba.php` que contenga `<?php echo "EJECUTADO";`. Abrí
   `https://TU-DOMINIO/uploads/events/prueba.php`: **no** tiene que decir
   "EJECUTADO" (tiene que dar error 403 o 404). Después borralo. Si dice
   "EJECUTADO", frená y avisá.
7. **Comprobantes privados:** `https://TU-DOMINIO/storage/` y
   `https://TU-DOMINIO/config/config.php` tienen que dar 404.
8. Cerrá sesión y probá abrir el comprobante de la reserva: tiene que pedir
   el login.
9. Borrá el evento de prueba (despublicalo) y la reserva de prueba (se puede
   rechazar).

## Mantenimiento

- **Copias de seguridad:** DonWeb hace una copia semanal. Además conviene
  exportar la base desde phpMyAdmin (**Exportar → Rápido → SQL**) una vez
  por semana y bajar la carpeta `storage/receipts`.
- **Errores:** si algo falla, el detalle queda en `storage/logs/php-error.log`
  (nunca se muestra en la página).
- **Actualizar el sitio:** volvé a generar el zip y subí solo `app/` y
  `public_html/` (sin pisar `config/config.php`, `storage/` ni
  `public_html/uploads/events/`, que tienen los datos reales).
- **Vencimiento de 30 minutos:** no necesita nada. Lo calcula la base de
  datos en cada visita, sin cron.
