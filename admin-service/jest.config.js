export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: [],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'server.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  forceExit: true, // Force Jest to exit after tests complete
};

