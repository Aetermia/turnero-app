-- Prueba de la restriccion R1: la base tiene que IMPEDIR dos reservas activas
-- de la misma persona en el mismo evento, y tiene que PERMITIR una nueva si la
-- anterior quedo rechazada, expirada o cancelada.
--
-- Se puede correr las veces que haga falta: limpia lo que inserta.
--
--   & "E:\PostgresSQL\bin\psql.exe" -U casa_de_anton -h 127.0.0.1 -d casa_de_anton -f scripts/verify-constraints.sql
--
-- Resultado ESPERADO:
--   - El paso 3 TIENE que fallar con: llave duplicada viola restriccion de
--     unicidad «reservations_active_per_person_unique». Ese error es el exito.
--   - El paso 5 TIENE que insertar sin problemas.

-- Limpieza previa (por si se corre mas de una vez)
DELETE FROM reservations WHERE public_token LIKE 'test-%';
DELETE FROM customers WHERE email = 'test@example.com';

-- 1) Una persona
INSERT INTO customers (full_name, email, whatsapp)
VALUES ('Persona de Prueba', 'test@example.com', '+5491100000000');

-- 2) Primera reserva activa (ocupa cupo) -> tiene que entrar
INSERT INTO reservations (event_id, customer_id, status, public_token, has_condition, terms_accepted_at, expires_at)
SELECT e.id, c.id, 'pending_no_receipt', 'test-uno', false, now(), now() + interval '30 minutes'
FROM events e, customers c
WHERE e.is_published = true AND c.email = 'test@example.com'
ORDER BY e.starts_at
LIMIT 1;

-- 3) SEGUNDA reserva activa de la misma persona y evento.
--    ESTE ES EL PASO QUE TIENE QUE FALLAR.
INSERT INTO reservations (event_id, customer_id, status, public_token, has_condition, terms_accepted_at, expires_at)
SELECT e.id, c.id, 'pending_no_receipt', 'test-dos', false, now(), now() + interval '30 minutes'
FROM events e, customers c
WHERE e.is_published = true AND c.email = 'test@example.com'
ORDER BY e.starts_at
LIMIT 1;

-- 4) La duena RECHAZA la primera reserva
UPDATE reservations SET status = 'rejected', resolved_at = now() WHERE public_token = 'test-uno';

-- 5) La persona vuelve a intentar: la rechazada NO tiene que bloquearla.
INSERT INTO reservations (event_id, customer_id, status, public_token, has_condition, terms_accepted_at, expires_at)
SELECT e.id, c.id, 'pending_no_receipt', 'test-dos', false, now(), now() + interval '30 minutes'
FROM events e, customers c
WHERE e.is_published = true AND c.email = 'test@example.com'
ORDER BY e.starts_at
LIMIT 1;

-- 6) Estado final: test-uno rechazada y test-dos activa
SELECT public_token, status FROM reservations WHERE public_token LIKE 'test-%' ORDER BY public_token;

-- 7) Limpieza: no se deja basura de prueba en la base de desarrollo
DELETE FROM reservations WHERE public_token LIKE 'test-%';
DELETE FROM customers WHERE email = 'test@example.com';
