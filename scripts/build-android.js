const { spawnSync } = require('node:child_process');
const path = require('node:path');

const androidDirectory = path.resolve(__dirname, '..', 'android');
const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(wrapper, ['assembleDebug'], {
  cwd: androidDirectory,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

process.exit(result.status ?? 1);
