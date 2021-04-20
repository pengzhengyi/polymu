const path = require('path');

module.exports = [
  'source-map'
].map(devtool => ({
  entry: './src/views/BaseView.ts',
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
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    library: 'polymu',
  },
  devtool,
  optimization: {
    runtimeChunk: true
  },
}));