<?php

declare(strict_types=1);

/*
 * A minimal router: method + path pattern -> handler. "{name}" segments match
 * one path segment and are passed to the handler by name. Anything that does
 * not match answers 404, never a stack trace.
 */
final class Router
{
    /** @var list<array{string, string, callable}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler): void
    {
        $this->routes[] = ['GET', $this->compile($pattern), $handler];
    }

    public function post(string $pattern, callable $handler): void
    {
        $this->routes[] = ['POST', $this->compile($pattern), $handler];
    }

    public function dispatch(string $method, string $path): void
    {
        $pathMatched = false;
        foreach ($this->routes as [$routeMethod, $regex, $handler]) {
            if (!preg_match($regex, $path, $matches)) {
                continue;
            }
            $pathMatched = true;
            if ($routeMethod !== $method) {
                continue;
            }
            $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
            $handler($params);
            return;
        }

        if ($pathMatched) {
            http_response_code(405);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'Método no permitido';
            return;
        }
        not_found();
    }

    private function compile(string $pattern): string
    {
        $regex = preg_replace('#\{([a-zA-Z_]+)\}#', '(?P<$1>[^/]+)', $pattern);
        return '#^' . $regex . '$#';
    }
}
