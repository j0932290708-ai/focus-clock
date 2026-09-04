// 僅供測試，打包白名單不包含本檔；不讀取使用者的正式排程。
const { app } = require('electron');
const path = require('node:path');
const profile = process.env.FOCUS_TEST_PROFILE;
if (!profile || !path.isAbsolute(profile)) throw new Error('Test profile required');
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
// 即使測試中斷，專注視窗也會在 80 秒後退出，不永久鎖住桌面。
setTimeout(() => app.quit(), 80000).unref();
require('../../main');
