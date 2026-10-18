<?php

declare(strict_types=1);

/*
 * Public pages. Each one reads live data on every request: no caching, so a
 * seat count is never stale.
 */
final class PublicController
{
    public static function home(): void
    {
        respond('home', ['events' => Events::upcomingPublished()]);
    }

    /** @param array<string, string> $params */
    public static function event(array $params): void
    {
        $event = Events::publishedById($params['id']);
        // A draft or a missing event is a real 404 here, and it is noindex.
        if ($event === null) {
            not_found();
        }
        respond('event', ['event' => $event, 'title' => $event['title']]);
    }
}
