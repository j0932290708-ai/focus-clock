const test = require('node:test');
const assert = require('node:assert/strict');
const { disposeFocusWindow } = require('../focus-window');

test('退出先離開輸入事件，再關閉專注視窗，重複請求不重複銷毀', () => {
  const callbacks = [];
  let destroyed = false, count = 0;
  const window = { isDestroyed: () => destroyed, destroy() { destroyed = true; count++; } };
  disposeFocusWindow(window, callback => callbacks.push(callback));
  disposeFocusWindow(window, callback => callbacks.push(callback));
  assert.equal(count, 0);
  callbacks.forEach(callback => callback());
  assert.equal(count, 1);
});
test('失去或已關閉的專注視窗不會被再次操作', () => {
  const defer = () => { throw new Error('不應排入關閉'); };
  disposeFocusWindow(null, defer);
  disposeFocusWindow({ isDestroyed: () => true }, defer);
});
