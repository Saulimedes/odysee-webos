const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const { injectBoot, BOOT_FILES } = require('./tools/index-html');
const { execSync } = require('child_process');
const appInfo = require('./assets/appinfo.json');

function buildCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

module.exports = {
  entry: {
    app: ['./src/index.tsx'],
  },
  target: ['web', 'es2017'],
  devtool: false,
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx|mjs)$/,
        exclude: /core-js/,
        use: ['babel-loader'],
      },
      {
        test: /\.css$/i,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { importLoaders: 1 } },
          path.resolve(__dirname, 'tools/min-css-loader.js'),
        ],
      },
      {
        test: /\.woff2$/i,
        type: 'asset/resource',
        generator: { filename: 'fonts/[name][ext]' },
      },
    ],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs'],
    modules: [path.resolve(__dirname, 'src'), 'node_modules'],
  },
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: '[name].bundle.js',
    chunkFilename: '[name].chunk.js',
    clean: true,
  },
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          chunks: 'initial',
          priority: 10,
        },
      },
    },
  },
  plugins: [
    {
      apply: (compiler) => compiler.hooks.thisCompilation.tap('BootFiles', (compilation) => {
        BOOT_FILES.forEach((file) => compilation.fileDependencies.add(file));
      }),
    },
    new webpack.DefinePlugin({
      APP_VERSION: JSON.stringify(appInfo.version),
      APP_ID: JSON.stringify(appInfo.id),
      APP_COMMIT: JSON.stringify(buildCommit()),
      DEV_SERVER: JSON.stringify(process.env.WEBPACK_SERVE === 'true'),
    }),
    new CopyPlugin({
      patterns: [
        { context: 'assets', from: '**/*' },
        { context: 'src/shared/branding', from: 'odysee-logo.png' },
        { context: 'src/app/styles/fonts', from: '*.{txt,md}', to: 'fonts' },
        { context: 'src', from: 'index.html', transform: (content) => injectBoot(content.toString()) },
      ],
    }),
  ],
  devServer: {
    static: path.resolve(__dirname, './dist'),
    port: 3333,
    proxy: [
      { context: ['/lbry-tv'], target: 'https://api.lbry.tv', pathRewrite: { '^/lbry-tv': '' }, changeOrigin: true, secure: true },
      { context: ['/odysee-proxy'], target: 'https://api.na-backend.odysee.com', pathRewrite: { '^/odysee-proxy': '' }, changeOrigin: true, secure: true },
      { context: ['/lbry-api-com'], target: 'https://api.lbry.com', pathRewrite: { '^/lbry-api-com': '' }, changeOrigin: true, secure: true },
    ],
  },
};
