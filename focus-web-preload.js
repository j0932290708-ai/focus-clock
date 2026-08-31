const { ipcRenderer, webFrame } = require('electron');

const popupMessage = 'focus-clock-popup-blocked';

function reportBlockedPopup() {
  ipcRenderer.send('focus:web-popup-blocked');
}

window.addEventListener('message', (event) => {
  if (event.source === window && event.data === popupMessage) reportBlockedPopup();
});

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (event) => {
    const link = event.target?.closest?.('a[href]');
    if (!link || link.target.toLowerCase() !== '_blank') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    reportBlockedPopup();
  }, true);

  document.addEventListener('submit', (event) => {
    if (event.target?.tagName !== 'FORM' || event.target.target.toLowerCase() !== '_blank') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    reportBlockedPopup();
  }, true);

  webFrame.executeJavaScript(`
    (() => {
      const blockedOpen = () => {
        window.postMessage('${popupMessage}', '*');
        return null;
      };
      try {
        Object.defineProperty(window, 'open', {
          value: blockedOpen,
          configurable: false,
          writable: false
        });
      } catch {
        window.open = blockedOpen;
      }
    })();
  `).catch(() => {});
});
