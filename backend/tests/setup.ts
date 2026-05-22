// Shared test bootstrap. Loaded by vitest before any test module via
// `setupFiles` in vitest.config.ts. Centralizes the env defaults that every
// integration test needs so the per-file `beforeAll` blocks stay focused on
// fixtures.

// AUTH_RATE_LIMIT_MAX defaults to 10 in production env loading, which trips
// the integration suite the moment a single test file does >10 registrations.
// Bump it for the test process unless the runner already set one explicitly.
process.env.AUTH_RATE_LIMIT_MAX ??= '10000';
process.env.GLOBAL_RATE_LIMIT_MAX ??= '100000';

// JWT + cookie defaults so individual test files don't have to repeat them.
process.env.NODE_ENV ??= 'test';
process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_at_least_32_chars_long_xx';
process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_at_least_32_chars_long_x';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
process.env.COOKIE_SECURE ??= 'false';
