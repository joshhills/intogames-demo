# API Service Tests

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

### Unit Tests (`__tests__/unit/`)
- **auth.test.js**: Tests for authentication logic (JWT generation, validation)

### Integration Tests (`__tests__/integration/`)
- **api.test.js**: Full endpoint testing with HTTP requests

## Test Helpers (`__tests__/helpers/`)
- **test-helpers.js**: Utilities for generating test tokens, headers, UUIDs

## Mocks (`__tests__/mocks/`)
- **redis-mock.js**: In-memory Redis mock for unit tests

## Notes

- Integration tests require a Redis instance (or will use the mock)
- Tests use `NODE_ENV=test` to prevent the server from starting during test runs
- The `app` is exported from `server.js` for testing purposes

