const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node', // Chạy trong môi trường Node.js
  entry: './src/extension.js', // File chính của extension
  output: {
    path: path.resolve(__dirname, 'src/dist'), // Xuất vào src/dist
    filename: 'extension.js',
    libraryTarget: 'commonjs2', // Định dạng cho VS Code Extension
  },
  resolve: {
    extensions: ['.js'],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader', // Dùng Babel để đảm bảo tương thích
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  externals: {
    vscode: 'commonjs vscode', // Để VS Code tự load module này
    rocksdb: 'commonjs rocksdb', // Giữ nguyên module rocksdb
    'level-rocksdb': 'commonjs level-rocksdb', // Giữ nguyên module level-rocksdb
    '@vscode/ripgrep': 'commonjs @vscode/ripgrep',
  },
};
