const path = require('path');

module.exports = {
  entry: './src/PreviewForm/media/src/main.js',
  output: {
    path: path.resolve(__dirname, 'src/PreviewForm/media'),
    filename: 'bundle.js',
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  experiments: {
    outputModule: false // Prevent ESM output conflicts if the surrounding is CJS
  }
};
