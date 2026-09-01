const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const source = path.join(projectRoot, 'pwa-icon-512.png');
const destination = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'drawable', 'focus_clock_icon.png');

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log('已同步 Android 番茄鐘圖示。');
