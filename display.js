(() => {
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.() || !capacitor.registerPlugin) return;
  const plugin = capacitor.registerPlugin('FocusDisplay');
  let enabled = false;
  window.focusDisplay = {
    get enabled() { return enabled; },
    async setFullscreen(value) {
      const result = await plugin.setFullscreen({ enabled: value });
      enabled = result.enabled;
      return enabled;
    }
  };
  if (!document.querySelector('#fullscreen-button')) window.focusDisplay.setFullscreen(false).catch(() => {});
})();
