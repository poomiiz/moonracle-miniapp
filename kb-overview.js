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
        for (const quota of account.quotas) {
          const row = el('div', null, 'row'); row.append(el('span', quota.model + ' · ' + quota.window_name), el('b', 'เหลือ ' + fmt(quota.remaining_percent) + '%')); details.append(row);
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
