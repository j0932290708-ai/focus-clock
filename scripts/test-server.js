// 僅提供公開的 App 檔案；不開放原始資料、.git 或 node_modules。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = new Set(['index.html', 'focus.html', 'styles.css', 'focus.css', 'logic.js',
  'renderer.js', 'web-adapter.js', 'focus.js', 'service-worker.js', 'manifest.json',
  'pwa-icon-192.png', 'pwa-icon-512.png']);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = pathname === '/focus-clock/' ? 'index.html' : pathname.replace(/^\/focus-clock\//, '');
  if (request.method !== 'GET' || !pathname.startsWith('/focus-clock/') || !files.has(file)) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(root, file)).pipe(response);
}).listen(4174, '127.0.0.1', () => console.log('Local test: http://127.0.0.1:4174/focus-clock/'));
