const { pathToFileURL } = require('node:url');

function isTrustedSender(event, window, file) {
  if (!window || window.isDestroyed() || !event?.senderFrame) return false;
  return event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === pathToFileURL(file).href;
}

function hasSafePayload(payload) {
  try { return Buffer.byteLength(JSON.stringify(payload) ?? '', 'utf8') <= 1024 * 1024; }
  catch { return false; }
}

module.exports = { isTrustedSender, hasSafePayload };
