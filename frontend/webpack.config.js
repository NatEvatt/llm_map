const path = require('path');
const Dotenv = require('dotenv-webpack');

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'public'),
    },
    compress: true,
    port: 9001, // Change this to an available port
    historyApiFallback: true,
    host: '0.0.0.0',
    hot: true,
    open: true,
    allowedHosts: "all"
  },
  plugins: [
    new Dotenv({
      path: path.resolve(__dirname, '../.env'), // Path to your .env file
      systemvars: true, // Load all system variables as well
      safe: true // Load '.env.example' to verify the '.env' variables are all set
    })
  ]
};
