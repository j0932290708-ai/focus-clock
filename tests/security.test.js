const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isTrustedSender, hasSafePayload } = require('../security');
test('FC-P2-04：只信任指定本地視窗的主 frame，不信任遠端/子 frame/另一視窗', () => {
  const file = path.resolve('index.html');
  const frame = { url: pathToFileURL(file).href };
  const contents = { mainFrame: frame };
  const window = { isDestroyed: () => false, webContents: contents };
  const event = { sender: contents, senderFrame: frame };
  assert.equal(isTrustedSender(event, window, file), true);
  assert.equal(isTrustedSender({ ...event, sender: {} }, window, file), false);
  assert.equal(isTrustedSender({ ...event, senderFrame: { ...frame } }, window, file), false);
  frame.url = 'https://example.com';
  assert.equal(isTrustedSender(event, window, file), false);
  assert.equal(isTrustedSender(event, null, file), false);
});
test('FC-P2-04：IPC 超大/循環 payload 拒絕', () => {
  assert.equal(hasSafePayload('x'.repeat(1024 * 1024)), false);
  const circular = {}; circular.self = circular;
  assert.equal(hasSafePayload(circular), false);
  assert.equal(hasSafePayload({ id: 'safe' }), true);
});
