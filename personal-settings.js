(() => {
  const $ = selector => document.querySelector(selector);
  let previewing = false;
  let previewTimer;
  let busy = false;
  function stopPreview() {
    clearTimeout(previewTimer);
    previewing = false;
    window.focusAlarm.stop();
    $('#preview-ringtone').textContent = '試聽鈴聲';
  }
  async function update(action) {
    if (busy) return;
    busy = true;
    stopPreview();
    $('#choose-ringtone').disabled = $('#reset-ringtone').disabled = $('#preview-ringtone').disabled = true;
    try {
      await action();
      $('#ringtone-name').textContent = window.focusAlarm.name;
      $('#ringtone-message').textContent = '鈴聲已儲存。';
    } catch (error) { $('#ringtone-message').textContent = error.message; }
    finally {
      busy = false;
      $('#choose-ringtone').disabled = $('#reset-ringtone').disabled = $('#preview-ringtone').disabled = false;
    }
  }
  $('#choose-ringtone').addEventListener('click', () => $('#ringtone-file').click());
  $('#ringtone-file').addEventListener('change', event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) update(() => window.focusAlarm.choose(file));
  });
  $('#reset-ringtone').addEventListener('click', () => update(() => window.focusAlarm.reset()));
  $('#preview-ringtone').addEventListener('click', async () => {
    if (previewing) { stopPreview(); return; }
    previewing = true;
    $('#preview-ringtone').textContent = '停止試聽';
    const played = await window.focusAlarm.play();
    if (!previewing) return;
    if (!played) { stopPreview(); $('#ringtone-message').textContent = '無法播放鈴聲，請再點一次試聽或改用內建鈴聲。'; return; }
    previewTimer = setTimeout(stopPreview, 5000);
  });
  window.focusAlarm.ready.then(() => { $('#ringtone-name').textContent = window.focusAlarm.name; });

  async function ring() {
    const played = await window.focusAlarm.play();
    $('#retry-alarm').hidden = played;
    $('#alarm-message').textContent = played ? '鈴聲已響起，休息一下吧。' : '時間到了！點「播放鈴聲」即可響鈴。';
  }
  window.showCompletionAlarm = () => {
    stopPreview();
    if (!$('#alarm-dialog').open) $('#alarm-dialog').showModal();
    ring();
  };
  $('#retry-alarm').addEventListener('click', ring);
  $('#stop-alarm').addEventListener('click', () => $('#alarm-dialog').close());
  $('#alarm-dialog').addEventListener('close', () => window.focusAlarm.stop());
})();
