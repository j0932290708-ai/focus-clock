const os = require('node:os');
const path = require('node:path');

try {
  os.userInfo();
} catch {
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || 'user',
    homedir: process.env.USERPROFILE || process.cwd(),
    shell: process.env.ComSpec || 'cmd.exe'
  });
}

const capacitorRoot = path.dirname(require.resolve('@capacitor/cli/package.json'));
require(path.join(capacitorRoot, 'dist', 'index.js')).run();
