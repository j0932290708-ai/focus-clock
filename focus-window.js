// 專注視窗沒有本機待存表單。已確認退出或到點時，不讓網頁阻擋解鎖。
function disposeFocusWindow(window, defer = setImmediate) {
  if (!window || window.isDestroyed()) return;
  // 先讓鍵盤／滑鼠事件返回 Chromium，再關閉它，避免事件處理中重入視窗關閉。
  defer(() => {
    if (!window.isDestroyed()) window.destroy();
  });
}
module.exports = { disposeFocusWindow };
