const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  presets: [
    ['@babel/preset-env', {
      useBuiltIns: 'usage',
      corejs: 3,
      targets: {
        browsers: ['chrome >= 53']
      }
    }],
    ['@babel/preset-react', {
      runtime: 'automatic'
    }]
  ],
  plugins: isProduction ? [
    ['transform-remove-console', { exclude: ['error', 'warn'] }]
  ] : []
};
