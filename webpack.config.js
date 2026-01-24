const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const appInfo = require('./assets/appinfo.json');

module.exports = {
  entry: {
    app: [
      'core-js/stable',
      'regenerator-runtime/runtime',
      './src/index.jsx'
    ]
  },
  devtool: false,
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx|mjs)$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      },
      {
        // Transpile modern syntax in node_modules for Chrome 68 compatibility
        test: /\.(js|mjs)$/,
        include: /node_modules/,
        exclude: /node_modules[\\/](core-js|regenerator-runtime)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: { browsers: ['chrome >= 53'] },
                modules: false,  // Don't transform modules - keeps ESM intact
                useBuiltIns: false,  // Don't inject polyfills here
              }]
            ],
            sourceType: 'unambiguous',  // Handle both ESM and CJS
          }
        }
      },
      {
        test: /\.css$/i,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1
            }
          }
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs'],
    modules: ['node_modules', path.resolve(__dirname, 'src')],
    alias: {
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: 'bundle.js',
  },
  plugins: [
    new webpack.DefinePlugin({
      APP_VERSION: JSON.stringify(appInfo.version),
      APP_ID: JSON.stringify(appInfo.id),
    }),
    new CopyPlugin({
      patterns: [
        { context: 'assets', from: '**/*' },
        { context: 'src', from: 'index.html' },
        { context: 'src', from: 'sw.js' },
      ],
    }),
  ],
  devServer: {
    static: path.resolve(__dirname, './dist'),
    port: 3333,
    proxy: {
      '/lbry-api': {
        target: 'https://api.lbry.tv',
        pathRewrite: { '^/lbry-api': '' },
        changeOrigin: true,
        secure: true,
      },
      '/lighthouse': {
        target: 'https://lighthouse.lbry.com',
        pathRewrite: { '^/lighthouse': '' },
        changeOrigin: true,
        secure: true,
      },
      '/odysee-proxy': {
        target: 'https://api.na-backend.odysee.com',
        pathRewrite: { '^/odysee-proxy': '' },
        changeOrigin: true,
        secure: true,
      },
      '/lbry-api-com': {
        target: 'https://api.lbry.com',
        pathRewrite: { '^/lbry-api-com': '' },
        changeOrigin: true,
        secure: true,
      },
    },
  },
};
