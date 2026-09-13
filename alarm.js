(() => {
  const audio = new Audio('alarm.wav');
  audio.preload = 'auto';
  audio.loop = true;
  let objectUrl = null;
  let selectedName = '內建鈴聲';
  let playing = false;
  let operation = 0;
  let stopTimer;

  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('focus-clock-audio', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function stored(mode, value) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', mode);
      const store = transaction.objectStore('settings');
      const request = mode === 'readonly' ? store.get('ringtone') :
        value ? store.put(value, 'ringtone') : store.delete('ringtone');
      transaction.oncomplete = () => { db.close(); resolve(request.result); };
      transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error || new Error('儲存失敗')); };
    });
  }
  function stop() {
    operation++;
    playing = false;
    clearTimeout(stopTimer);
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
  }
  function setSource(record, initializing = false) {
    if (initializing) audio.pause();
    else stop();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = record ? URL.createObjectURL(record.blob) : null;
    audio.src = objectUrl || 'alarm.wav';
    selectedName = record?.name || '內建鈴聲';
    audio.load();
  }
  const ready = stored('readonly').then(record => {
    if (record?.blob instanceof Blob && record.blob.size <= 10 * 1024 * 1024) setSource(record, true);
  }).catch(() => {});

  async function validate(file) {
    if (!/\.mp3$/i.test(file.name)) throw new Error('請選擇 MP3 音訊檔。');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('MP3 大小需介於 1 位元組與 10 MB 之間。');
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('無法讀取這個 MP3，請換一個檔案。')), 10000);
        probe.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
        probe.onerror = () => { clearTimeout(timeout); reject(new Error('這個檔案無法播放，請選擇有效的 MP3。')); };
        probe.src = url;
        probe.load();
      });
    } finally { probe.removeAttribute('src'); probe.load(); URL.revokeObjectURL(url); }
  }
  async function choose(file) {
    await ready;
    await validate(file);
    const record = { name: file.name, blob: file };
    try { await stored('readwrite', record); }
    catch { throw new Error('無法儲存鈴聲，請檢查裝置儲存空間。原本鈴聲仍保留。'); }
    setSource(record);
  }
  async function reset() {
    await ready;
    await stored('readwrite', null);
    setSource(null);
  }
  async function play() {
    const current = ++operation;
    await ready;
    if (current !== operation) return false;
    clearTimeout(stopTimer);
    audio.volume = 1;
    audio.currentTime = 0;
    playing = true;
    try { await audio.play(); }
    catch { if (current === operation) playing = false; return false; }
    if (current !== operation) return false;
    stopTimer = setTimeout(stop, 60000);
    return true;
  }
  // The gesture and the later alarm use the same media element on this page.
  function arm() {
    if (playing) return Promise.resolve(true);
    const current = ++operation;
    audio.volume = 0;
    return audio.play().then(() => {
      if (current !== operation) return false;
      audio.pause(); audio.currentTime = 0; audio.volume = 1;
      return true;
    }).catch(() => { audio.volume = 1; return false; });
  }
  window.focusAlarm = { ready, choose, reset, play, stop, arm, get name() { return selectedName; } };
  window.addEventListener('pagehide', stop);
})();
