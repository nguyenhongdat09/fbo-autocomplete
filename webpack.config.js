const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node', // Chạy trong môi trường Node.js
  entry: {
    extension: './src/extension.js', // File chính của extension
    // Worker CheckLegacy chạy ngoài main thread — phải bundle riêng vì
    // packaged extension chỉ ship src/dist/** (raw src/CheckLegacy/ không có trong vsix)
    CheckLegacyWorker: './src/CheckLegacy/CheckLegacyWorker.js',
    // Worker AnalystXML cũng vậy: bundle toàn bộ AnalystXML/AnalystASPX/AppDataPathHelper/
    // ProjectMappingHelper vào 1 file — copy raw vào dist sẽ gãy require tương đối (../AppDataPathHelper)
    'AnalystXML.worker': './src/TreeFile/BrowserHandle/AnalystXML.worker.js',
  },
  output: {
    path: path.resolve(__dirname, 'src/dist'), // Xuất vào src/dist
    filename: '[name].js',
    chunkFilename: '[id].extension.js', // giữ tên chunk động cũ (401.extension.js...)
    libraryTarget: 'commonjs2', // Định dạng cho VS Code Extension
  },
  resolve: {
    extensions: ['.js'],
    tsconfig: false
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
