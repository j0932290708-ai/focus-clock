(() => {
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return;
  // Plain HTML receives native plugin stubs directly; bundled clients may use registerPlugin.
  const plugin = capacitor.Plugins?.FocusDisplay || capacitor.registerPlugin?.('FocusDisplay');
  if (!plugin?.setFullscreen) return;
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
