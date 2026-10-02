/**
 * Stands in for the `server-only` package under test.
 *
 * That package throws on import outside a Server Component, which is the
 * point of it in the app and useless in a test runner: middleware and route
 * handlers are server code and still need covering.
 */
export {};
