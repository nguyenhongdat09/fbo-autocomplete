const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/FormulaPreview/media/src/App.jsx',
  output: {
    path: path.resolve(__dirname, 'src/FormulaPreview/media'),
    filename: 'bundle.js',
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  experiments: {
    outputModule: false,
  },
};
