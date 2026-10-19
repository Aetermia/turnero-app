# Casa de Antón: reservas de eventos

Sistema de reservas para Casa de Antón (casa de té en Tandil): catálogo de
encuentros, reserva con el lugar retenido 30 minutos, pago por transferencia
con comprobante y un panel para que la dueña apruebe, gestione eventos y
clientes.

**Tecnología:** PHP 8 (sin framework) + MySQL/MariaDB, pensado para el Plan
Emprendedor de DonWeb. El estilo es Tailwind v4, ya compilado en
`public/assets/app.css`: el servidor no necesita Node.

## Carpetas

| Carpeta | Qué hay |
| --- | --- |
| `public/` | Lo único visible desde internet (va en `public_html`). |
| `app/` | El código: controladores, dominio, vistas. |
| `config/` | `config.example.php`; el `config.php` real nunca va al repo. |
| `database/` | `schema.sql` y datos de ejemplo para desarrollo. |
| `storage/` | Comprobantes, sesiones y registros (fuera de `public_html`). |
| `tests/` | Verificaciones contra una base real. |
| `tools/` | Chequeo del hosting, hash de la contraseña, armado del zip. |

## En tu computadora

```
cp config/config.example.php config/config.php   # completar base, alias y admin
mysql -u USUARIO -p BASE < database/schema.sql
php database/seed.php                              # eventos de ejemplo (opcional)
php -S localhost:8090 -t public tools/dev-router.php
```

Para cambiar estilos: `npm install` y `npm run css` (o `npm run css:watch`).

## Pruebas

```
php tests/run-all.php
```

Usan una base `casa_test` (se borra y se vuelve a crear en cada script).

## Documentación

- `DEPLOY-DONWEB.md`: cómo subirlo a DonWeb, paso a paso.
- `PROGRESO-PHP.txt`: registro de la migración, tarea por tarea.
- `PROGRESO.txt`: historia del proyecto y estado actual (sección 0).
- `odd/tasks/`: especificación funcional.
