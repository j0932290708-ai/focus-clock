const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'www');
const webFiles = [
  'index.html',
  'styles.css',
  'logic.js',
  'web-adapter.js',
  'renderer.js',
  'focus.html',
  'focus.css',
  'focus.js',
  'manifest.json',
  'service-worker.js',
  'pwa-icon-192.png',
  'pwa-icon-512.png'
];

if (path.relative(projectRoot, outputDirectory) !== 'www' ||
  (fs.existsSync(outputDirectory) && fs.lstatSync(outputDirectory).isSymbolicLink())) {
  throw new Error('網頁輸出位置不安全，已停止建置。');
}
fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });
webFiles.forEach((file) => {
  fs.copyFileSync(path.join(projectRoot, file), path.join(outputDirectory, file));
});
console.log(`已準備 ${webFiles.length} 個 Android 網頁檔案。`);
