// Uses the same signed API session and task queue as the main Mini App.
const NEWS_CATEGORIES = {ai:'AI',github:'GitHub',tech:'Tech',film:'หนังสั้น',music_short:'เพลง / Shorts'};
const NEWS_STATES = {checking:'ตรวจต้นทาง',needs_review:'รอตรวจ / ต้องปรับ',generating_image:'สร้างภาพ',needs_headline:'รอหัวภาพ',ready_to_publish:'พร้อมจัดคิว',publishing:'กำลังโพสต์',published:'โพสต์แล้ว'};
let newsCategory = 'ai';
let newsRequest = 0;
function newsLink(value, label) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return el('span', 'ลิงก์ไม่พร้อม');
    const a = el('a', label); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  } catch { return el('span', 'ลิงก์ไม่พร้อม'); }
}
function newsActions(item) {
  const actions = el('div', null, 'act');
  ['สร้างงาน','เช็คเพิ่ม','ปรับงาน'].forEach(label => {
    const button = el('button', label);
    button.onclick = () => {
      current = 'new'; renderTabs();
      newTask({title:(label + ': ' + (item.headline || item.title || '')).slice(0,150),
        description:label+'จากข่าวนี้\nต้นทาง: '+(item.primary_url || item.url || '')+'\n'+(item.caption || item.summary || '')+'\n\nคำขอเพิ่มเติม: '});
    };
    actions.append(button);
  });
  return actions;
}
async function news() {
  const request = ++newsRequest;
  view.replaceChildren(el('p','กำลังโหลดข่าว…','meta'));
  try {
    const data = await api('/api/daily-trends');
    if (current !== 'news' || request !== newsRequest) return;
    const pipeline = data.content_pipeline || {}, meta = data.digest?.metadata || {};
    const heading = el('div', null, 'card');
    heading.append(el('h2','ข่าวและโพสต์ PooMi'),el('p',(data.automatic_update?'ตัวเก็บข่าวทำงานทุก '+((data.refresh_interval_seconds || 300)/60)+' นาที':'ตัวเก็บข่าวยังไม่ยืนยันว่าทำงาน')+' · แสดงผลวิเคราะห์ล่าสุด 100 เรื่อง · คะแนนเป็นความเห็น AI','sub'));
    if (meta.refreshed_at) heading.append(el('p','ข้อมูลล่าสุด '+new Date(meta.refreshed_at).toLocaleString('th-TH'),'meta'));
    const actions = el('div', null, 'act');
    [['อัปเดตข่าว','/refresh'],['ให้ Gemini วิเคราะห์','/analyse']].forEach(([label,path]) => {
      const b = el('button',label); b.onclick = async () => {
        b.disabled = true;
        try { const r = await api('/api/daily-trends'+path,{method:'POST'});
          if (r.ok === false) throw new Error(r.busy?'กำลังอัปเดตอยู่':'อัปเดตไม่สำเร็จ');
          popup(r.job_id?'เข้าคิว Gemini #'+r.job_id:'อัปเดตข้อมูลแล้ว'); await news();
        } catch(e) { popup(e.message); } finally { b.disabled=false; }
      }; actions.append(b);
    });
    heading.append(actions);
    const categories = el('div',null,'act');
    Object.entries(NEWS_CATEGORIES).forEach(([key,label]) => {
      const b = el('button',label,key===newsCategory?'primary':'');
      b.onclick=()=>{newsCategory=key;news();}; categories.append(b);
    }); heading.append(categories);
    const cards = [];
    for (const post of (pipeline.posts || []).filter(p=>p.pipeline && (p.category || 'ai')===newsCategory).reverse()) {
      const card=el('details',null,'card');
      card.append(el('summary',post.headline+' · '+(NEWS_STATES[post.status] || post.status)));
      card.append(el('p','ภาษา '+post.language+' · '+(post.editorial_status==='rejected'?'ต้องปรับคุณภาพ':'') ,'meta'));
      card.append(el('pre',post.caption || ''),el('p','ผู้อ่านได้อะไร: '+(post.benefit || 'ยังไม่มี'),'sub'));
      if(post.error)card.append(el('p',post.error,'err'));
      card.append(newsLink(post.primary_url,'เปิดต้นทาง ↗'));
      if(post.post_url)card.append(' · ',newsLink(post.post_url,'เปิดโพสต์จริง ↗'));
      card.append(newsActions(post));cards.push(card);
    }
    for(const analysis of pipeline.analyses || []) {
      const source=analysis.source || {};
      if(({'ข่าว AI':'ai','ข่าว GitHub':'github','ข่าว Tech':'tech'}[source.category] || 'tech')!==newsCategory)continue;
      const card=el('details',null,'card');
      card.append(el('summary',source.title+' · '+(analysis.score || 0)+'/100'));
      card.append(el('pre',analysis.reason || ''),el('p','หลักฐาน: '+({sufficient:'Gemini เห็นว่าพอ ยังต้องตรวจต้นทาง',partial:'มีบางส่วน ต้องตรวจเพิ่ม',insufficient:'ยังไม่พอ'}[analysis.reference_sufficiency] || 'ยังไม่ประเมิน'),'sub'));
      if(analysis.evidence_gaps?.length)card.append(el('pre',analysis.evidence_gaps.join('\n')));
      card.append(newsLink(source.url,'เปิดต้นทาง ↗'),newsActions(source));cards.push(card);
    }
    const raw=el('details',null,'card');raw.append(el('summary','ข่าวที่เก็บล่าสุด — ยังไม่ผ่านการคัด'));
    const category={'ai':'ข่าว AI','github':'ข่าว GitHub','tech':'ข่าว Tech','film':'ข่าวหนังและซีรีส์','music_short':'ข่าวเพลง'}[newsCategory];
    for(const item of (meta.items || []).filter(i=>i.category===category)) {
      const row=el('details');row.append(el('summary',item.title),el('pre',item.summary || 'ต้นทางให้เฉพาะพาดหัว'),newsLink(item.url,'เปิดต้นทาง ↗'),newsActions(item));raw.append(row);
    }
    view.replaceChildren(heading,...cards,raw);
  }catch(e){if(current==='news' && request===newsRequest)fail(e);}
}
