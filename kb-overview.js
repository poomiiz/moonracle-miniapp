async function overviewWidgets() {
  const room = el('div', null, 'card');
  const open = el('button', '💬 เปิดห้องกลาง', 'primary'); open.type = 'button';
  open.style.cssText = 'padding:12px 16px;border:0;border-radius:12px'; open.onclick = () => go('room');
  room.append(el('h2', 'ห้องกลาง'), el('p', 'คุยกับทีมและติดตามคำตอบในห้องเดิม', 'sub'), open);
  const usage = el('div', null, 'card'); usage.append(el('h2', 'Token Widget'));
  try {
    const data = await api('/pwa/token-summary');
    if (!data.available) usage.append(el('p', data.detail, 'sub'));
    else {
      usage.append(el('p', 'ยอดใช้วันนี้ · เวลาไทย · โควตาจากข้อมูลล่าสุดบนคอม', 'sub'));
      for (const account of data.accounts) {
        const details = el('details');
        details.append(el('summary', account.provider + ' · ' + account.label));
        details.append(el('p', account.tokens_today == null ? 'วันนี้ยังไม่มีข้อมูลการใช้โทเคน' : fmt(account.tokens_today) + ' โทเคนวันนี้', 'sub'));
        for (const model of account.models_today || []) details.append(el('p', model.model + ' · เข้า ' + fmt(model.input_tokens) + ' · ออก ' + fmt(model.output_tokens) + ' · cache อ่าน ' + fmt(model.cache_read_tokens) + ' / เขียน ' + fmt(model.cache_write_tokens), 'sub'));
        const snapshot = account.snapshot;
        if (snapshot) {
          for (const [key, label] of [['usage','ใช้สะสม'],['limit_value','วงเงิน'],['limit_remaining','คงเหลือ'],['usage_daily','ใช้รายวัน'],['usage_weekly','ใช้รายสัปดาห์'],['usage_monthly','ใช้รายเดือน']]) {
            if (snapshot[key] != null) details.append(el('p', label + ' ' + snapshot[key], 'sub'));
          }
          details.append(el('p', 'อัปเดต ' + snapshot.observed_at + (snapshot.reset_info ? ' · รีเซ็ต ' + snapshot.reset_info : ''), 'meta'));
        }
        for (const quota of account.quotas) {
          const row = el('div', null, 'row'); row.append(el('span', quota.model + ' · ' + quota.window_name), el('b', 'เหลือ ' + fmt(quota.remaining_percent) + '%' + (quota.reset_at ? ' · รีเซ็ต ' + new Date(quota.reset_at).toLocaleString('th-TH', {timeZone:'Asia/Bangkok'}) : ''))); details.append(row);
          const date = new Date(quota.observed_at);
          details.append(el('p', 'อัปเดต ' + (Number.isNaN(date.valueOf()) ? quota.observed_at : date.toLocaleString('th-TH', {timeZone:'Asia/Bangkok'})), 'meta'));
        }
        if (!account.quotas.length) details.append(el('p', 'ยังไม่มีข้อมูลโควตา', 'meta'));
        usage.append(details);
      }
    }
  } catch (error) { usage.append(el('p', 'Token Widget: ' + error.message, 'err')); }
  return [room, usage];
}
function centralRoom() {
  const back = el('button', '← ภาพรวม'); back.type = 'button'; back.onclick = () => go('overview');
  const box = el('div'); view.replaceChildren(back, box);
  MoonRoom.render(box, {api, el, tg, popup});
}

function openKbTool(key) {
  const pages = {music:'music', film:'film', products:'shopee-video', characters:'characters', tarot:'tarot', dhamma:'dhamma', divination:'divination', notebook:'notebooklm'};
  if (!pages[key]) return;
  if (!token()) return popup('เปิดเครื่องมือจริงจาก PWA และล็อกอินด้วย Telegram ก่อนครับ');
  const form = document.createElement('form'); form.method = 'POST'; form.action = API + '/auth/telegram/tools'; form.target = '_blank';
  for (const [name, value] of Object.entries({token:token(), page:pages[key]})) {
    const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.append(input);
  }
  document.body.append(form); form.submit(); form.remove();
}
