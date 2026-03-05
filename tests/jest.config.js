/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/unit/**/*.test.js'],
  // Resolve ../js/feed.js relative to the tests/ directory
  modulePaths: ['<rootDir>/..'],
};
