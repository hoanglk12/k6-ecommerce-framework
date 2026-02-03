const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const glob = require('webpack-glob-entries');

module.exports = {
  mode: 'production',
  entry: glob('./src/tests/*.ts'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'tests/[name].js',
    libraryTarget: 'commonjs',
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: {
      '@config': path.resolve(__dirname, 'src/config'),
      '@lib': path.resolve(__dirname, 'src/lib'),
      '@scenarios': path.resolve(__dirname, 'src/scenarios'),
      '@data': path.resolve(__dirname, 'src/data'),
      '@tests': path.resolve(__dirname, 'src/tests'),
      '@types': path.resolve(__dirname, 'src/types'),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { targets: { node: '18' } }],
              '@babel/preset-typescript',
            ],
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new CleanWebpackPlugin(),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/data',
          to: 'data',
          globOptions: {
            ignore: ['**/.gitkeep'],
          },
        },
        {
          from: 'src/config/environments',
          to: 'config/environments',
        },
      ],
    }),
  ],
  target: 'web',
  externals: /^(k6|https?:\/\/)(\/.*)?/,
  // Prevent bundling of certain imported packages
  externalsPresets: { node: false },
  stats: {
    colors: true,
    modules: true,
    reasons: true,
    errorDetails: true,
  },
  devtool: 'source-map',
  optimization: {
    minimize: false, // Keep code readable for debugging
    splitChunks: false,
  },
  performance: {
    hints: 'warning',
    maxEntrypointSize: 512000,
    maxAssetSize: 512000,
  },
};
