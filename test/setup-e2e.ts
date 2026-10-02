import 'reflect-metadata';

// Fail fast if the e2e suite is ever pointed at a non-test database.
if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    'e2e tests must run with NODE_ENV=test (use `npm run test:e2e`, which loads .env.test)',
  );
}
