module.exports = {
  collectCoverage: true,
  collectCoverageFrom: [
    'src/*.{js,jsx,ts,tsx}',
  ],
  coverageDirectory: 'coverage',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
};