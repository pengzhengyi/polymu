module.exports = {
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
  ],
  coverageDirectory: 'coverage',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ["<rootDir>/dist/", "<rootDir>/lib/", "<rootDir>/node_modules/"]
};