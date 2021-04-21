const path = require('path');

module.exports = [
  'source-map'
].map(devtool => ({
  entry: './src/polymu.ts',
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js' ],
  },
  output: {
    filename: 'polymu.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'polymu',
  },
  devtool
}));