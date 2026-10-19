<?php

declare(strict_types=1);

/*
 * Admin event data access (port of the admin half of src/lib/events.ts). Same
 * seat predicate as the catalog, so the panel and the catalog never disagree
 * about how many seats are taken. Only validated values reach these writes.
 */
final class EventsAdmin
{
    private const SELECT = 'SELECT e.id, e.title, e.theme, e.description, e.image_url, e.location,
               e.starts_at, e.ends_at, e.capacity, e.price, e.is_published, COUNT(r.id) AS occupied
        FROM events e
        LEFT JOIN reservations r ON r.event_id = e.id AND ' . Events::SEAT_HOLDING;

    /** @return list<array<string, mixed>> every event, drafts included, latest first */
    public static function all(): array
    {
        return array_map(self::normalize(...), Db::all(self::SELECT . ' GROUP BY e.id ORDER BY e.starts_at DESC'));
    }

    /** @return array<string, mixed>|null */
    public static function find(string $id): ?array
    {
        if (!is_uuid($id)) {
            return null;
        }
        $row = Db::one(self::SELECT . ' WHERE e.id = ? GROUP BY e.id', [$id]);
        return $row === null ? null : self::normalize($row);
    }

    /** A fresh event has no reservations, so there is no seat guard here. */
    public static function create(array $v): string
    {
        $id = uuid_v4();
        Db::run(
            'INSERT INTO events (id, title, theme, description, location, starts_at, ends_at, capacity, price, is_published)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $v['title'], $v['theme'], $v['description'], $v['location'], $v['starts_at'], $v['ends_at'],
                $v['capacity'], $v['price'], $v['is_published'] ? 1 : 0],
        );
        return $id;
    }

    /**
     * Updates an event, refusing to lower the capacity below the seats already
     * held. The guard is ONE UPDATE whose WHERE compares the new capacity with
     * an SQL count of occupied seats (same predicate as the catalog, timer by
     * NOW()): no reservation rows are loaded into PHP to decide. The row lock
     * taken first serializes this edit with Reservations::create, which locks
     * the same row, so a booking cannot slip in between the count and the
     * write.
     *
     * @return array{ok: true}|array{ok: false, reason: 'not_found'|'capacity_below_occupied'}
     */
    public static function update(string $id, array $v): array
    {
        if (!is_uuid($id)) {
            return ['ok' => false, 'reason' => 'not_found'];
        }
        return Db::transaction(static function (PDO $pdo) use ($id, $v): array {
            $lock = $pdo->prepare('SELECT id FROM events WHERE id = ? FOR UPDATE');
            $lock->execute([$id]);
            if ($lock->fetch() === false) {
                return ['ok' => false, 'reason' => 'not_found'];
            }
            $update = $pdo->prepare(
                'UPDATE events
                 SET title = ?, theme = ?, description = ?, location = ?, starts_at = ?, ends_at = ?,
                     capacity = ?, price = ?, is_published = ?
                 WHERE id = ?
                   AND ? >= (SELECT COUNT(*) FROM reservations r WHERE r.event_id = ? AND ' . Events::SEAT_HOLDING . ')'
            );
            $update->execute([$v['title'], $v['theme'], $v['description'], $v['location'], $v['starts_at'], $v['ends_at'],
                $v['capacity'], $v['price'], $v['is_published'] ? 1 : 0, $id, $v['capacity'], $id]);
            if ($update->rowCount() === 0) {
                // rowCount is 0 also when nothing changed; tell the cases apart.
                $guard = $pdo->prepare('SELECT ? >= (SELECT COUNT(*) FROM reservations r WHERE r.event_id = ? AND ' . Events::SEAT_HOLDING . ') AS fits');
                $guard->execute([$v['capacity'], $id]);
                if (!(bool) $guard->fetchColumn()) {
                    return ['ok' => false, 'reason' => 'capacity_below_occupied'];
                }
            }
            return ['ok' => true];
        });
    }

    /**
     * Only is_published changes: unpublishing removes the event from the
     * catalog and leaves its reservations untouched.
     */
    public static function setPublished(string $id, bool $published): bool
    {
        if (!is_uuid($id) || self::find($id) === null) {
            return false;
        }
        Db::run('UPDATE events SET is_published = ? WHERE id = ?', [$published ? 1 : 0, $id]);
        return true;
    }

    /** Only the photo column changes: a photo can never touch capacity rules. */
    public static function setImage(string $id, ?string $imageUrl): bool
    {
        if (!is_uuid($id) || self::find($id) === null) {
            return false;
        }
        Db::run('UPDATE events SET image_url = ? WHERE id = ?', [$imageUrl, $id]);
        return true;
    }

    /** @param array<string, mixed> $row */
    private static function normalize(array $row): array
    {
        $row['capacity'] = (int) $row['capacity'];
        $row['occupied'] = (int) $row['occupied'];
        $row['is_published'] = (bool) $row['is_published'];
        $row['seats_available'] = max(0, $row['capacity'] - $row['occupied']);
        return $row;
    }
}
