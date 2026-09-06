// Windows 資料儲存：先寫暫存檔、同步磁碟，再取代正式檔；同一檔案依序寫入。
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

async function createStore(file, fallback, validate, onWarning = () => {}, io = fs) {
  let value = structuredClone(fallback);
  let previousText = null;
  let queue = Promise.resolve();
  let blocked = false;
  await io.mkdir(path.dirname(file), { recursive: true });
  const parse = (text) => validate(JSON.parse(text));
  try {
    const text = await io.readFile(file, 'utf8');
    value = parse(text);
    previousText = JSON.stringify(value, null, 2);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      try { await io.copyFile(file, `${file}.corrupt-${Date.now()}-${randomUUID()}`); }
      catch { blocked = true; }
      onWarning('原始資料無法讀取，已保留原檔；正在嘗試上一版備份。');
    }
    try {
      value = parse(await io.readFile(`${file}.bak`, 'utf8'));
      onWarning('已從上一版備份復原，請檢查排程並匯出備份。');
    } catch {
      if (error.code !== 'ENOENT') onWarning('沒有可用備份，暫不啟用排程；原檔仍保留，請匯入備份。');
    }
  }

  async function atomicWrite(target, text) {
    const temporary = `${target}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await io.open(temporary, 'wx', 0o600);
      await handle.writeFile(text, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await io.rename(temporary, target);
    } finally {
      if (handle) await handle.close().catch(() => {});
      await io.unlink(temporary).catch(() => {});
    }
  }

  return {
    read: () => structuredClone(value),
    update(change) {
      const work = queue.then(async () => {
        if (blocked) throw new Error('無法保留損壞原檔，為避免資料流失已停止寫入。');
        const next = validate(await change(structuredClone(value)));
        const text = JSON.stringify(next, null, 2);
        if (previousText !== null) await atomicWrite(`${file}.bak`, previousText);
        await atomicWrite(file, text);
        value = next;
        previousText = text;
        return structuredClone(next);
      });
      queue = work.catch(() => {});
      return work;
    },
    flush: () => queue
  };
}

module.exports = { createStore };
