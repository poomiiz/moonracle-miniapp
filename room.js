// Central room tab for the KB mini app (kb.html): chats, replies, job buttons, token use, activity.
// It reuses the mini app's own api() (Telegram initData or the owner login), so only P'Ohm gets in.
// Posts never carry agent_id: a message without one is P'Ohm's, and the tray at home answers it.
// Plug-in (3 lines in kb.html): <script src="room.js"></script>, add ["room","💬","ห้องกลาง"] to TABS,
// and in show(): else if (current === "room") MoonRoom.render(view, {api, el, tg, popup});
(function () {
  "use strict";
  const ROOM_TITLE = "ห้องกลาง";
  const MARK = {claude: "🟠", codex: "⚫", antigravity: "🔺", "openai-compatible": "🌙"};
  const STEP = {pending: "☐", done: "✓", blocked: "⚠"};
  const JOB_STATE = {proposed: "รอพี่ยืนยันแผน", running: "กำลังทำ", paused: "หยุดรอพี่สั่งต่อ", blocked: "ติดปัญหา",
    review: "หัวหน้าตรวจผ่าน รอพี่รับงาน", completed: "ปิดงานแล้ว", cancelled: "ยกเลิกแล้ว"};
  let ctx = null, roomId = null, items = [], openRoot = null, mode = "list", timer = null, lastKey = "", onBack = null;

  const css = document.createElement("style");
  css.textContent = `
.rm-chat{display:flex;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
.rm-chat .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}
.rm-dot{width:9px;height:9px;border-radius:50%;flex:none;border:2px solid var(--muted)}
.rm-dot.waiting{background:var(--accent);border-color:var(--accent)}.rm-dot.error{background:var(--bad);border-color:var(--bad)}
.rm-msg{margin:8px 0;padding:8px 10px;border-radius:10px;background:var(--panel);border:1px solid var(--line);font-size:14px;white-space:pre-wrap;word-break:break-word}
.rm-msg.me{background:#2a2550;margin-left:24px}.rm-msg.bad{border-color:var(--bad)}
.rm-who{font-size:12px;color:var(--muted);margin-bottom:4px}
details.rm-drafts{margin:6px 0 6px 12px}details.rm-drafts summary{font-size:12px;color:var(--muted)}
.rm-steps div{font-size:13px;padding:2px 0}
.rm-send{position:sticky;bottom:calc(64px + env(safe-area-inset-bottom));background:var(--bg);padding-top:6px}
.rm-send textarea{min-height:64px;margin:0 0 6px}
.rm-phase{display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:6px 0;border-bottom:1px solid var(--line)}
.rm-phase span:last-child{color:var(--muted);text-align:right;white-space:nowrap}`;
  document.head.append(css);

  // ---- data -----------------------------------------------------------------------------------
  const usageOf = i => {
    if (!String(i.ref_code || "").startsWith("{") || !(i.tags || []).includes("usage") && !i.agent_id) return null;
    try { const u = JSON.parse(i.ref_code); return u && typeof u === "object" ? u : null; } catch { return null; }
  };
  const tokens = u => u && u.reported ? (u.input_tokens || 0) + (u.output_tokens || 0) : 0;
  const k = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n);
  const isDraft = i => (i.tags || []).includes("team-draft");
  const isAside = i => isDraft(i) || (i.tags || []).includes("auto");
  const roots = () => items.filter(i => !i.parent_argument_id);
  const threadOf = id => items.filter(i => i.id === id || i.parent_argument_id === id)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  function stateOf(id) {
    const t = threadOf(id), finals = t.filter(i => !isAside(i));
    if (!finals.length || !finals[finals.length - 1].agent_id) return "waiting";
    const lastMine = t.map(i => !i.agent_id).lastIndexOf(true);
    return t.slice(lastMine + 1).some(i => i.log_type === "blocker") ? "error" : "done";
  }
  const nameOf = i => (usageOf(i) || {}).role || i.agent_name || "ทีม";
  const markOf = i => i.log_type === "blocker" ? "⚠️" : MARK[(usageOf(i) || {}).provider] || "•";
  const title = r => (r.content || "แชท").split("\n")[0].slice(0, 60);

  async function load() {
    if (!roomId) {
      const meetings = await ctx.api("/dc/meetings");
      const room = meetings.find(m => (m.meeting_title || m.title) === ROOM_TITLE && (m.meeting_status || m.status) !== "completed");
      if (!room) throw new Error("ไม่พบห้องกลาง");
      roomId = room.meeting_id || room.id;
    }
    items = await ctx.api(`/dc/meetings/${encodeURIComponent(roomId)}/arguments`);
  }
  async function post(body) {
    await ctx.api(`/dc/meetings/${encodeURIComponent(roomId)}/arguments`, {method: "POST", body: JSON.stringify(body)});
    lastKey = "";
    await refresh();
  }

  // ---- views ----------------------------------------------------------------------------------
  function list(view) {
    const today = new Date().toISOString().slice(0, 10), byRole = {};
    let todayTokens = 0, todayCost = 0;
    for (const i of items) {
      const u = usageOf(i);
      if (!u || !u.reported || !String(i.created_at).startsWith(today)) continue;
      todayTokens += tokens(u); todayCost += u.cost_usd || 0;
      byRole[nameOf(i)] = (byRole[nameOf(i)] || 0) + tokens(u);
    }
    const head = ctx.el("div", null, "card");
    head.append(ctx.el("h2", "token วันนี้"), ctx.el("div", `${k(todayTokens)} token${todayCost ? ` · ≈$${todayCost.toFixed(2)}` : ""}`, "sub"),
      ctx.el("div", Object.entries(byRole).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${k(n)}`).join(" · ") || "ยังไม่มีการใช้วันนี้", "sub"));
    const compose = sender(null);
    const chats = ctx.el("div", null, "card");
    chats.append(ctx.el("h2", "แชท"));
    const sorted = roots().map(r => [r, threadOf(r.id)]).sort((a, b) => String(b[1].at(-1).created_at).localeCompare(String(a[1].at(-1).created_at)));
    for (const [r, t] of sorted.slice(0, 40)) {
      const row = ctx.el("div", null, "rm-chat");
      const spent = t.reduce((n, i) => n + tokens(usageOf(i)), 0);
      row.append(ctx.el("span", null, `rm-dot ${stateOf(r.id)}`), ctx.el("span", title(r), "t"), ctx.el("span", spent ? k(spent) : "", "meta"));
      row.onclick = () => { openRoot = r.id; mode = "thread"; lastKey = ""; draw(); };
      chats.append(row);
    }
    view.replaceChildren(head, compose, chats);
  }

  function sender(root) {
    const box = ctx.el("div", null, "rm-send");
    const text = ctx.el("textarea"); text.placeholder = root ? "พิมพ์ต่อในแชทนี้…" : "พิมพ์เพื่อเปิดแชทใหม่…";
    const act = ctx.el("div", null, "act");
    const send = ctx.el("button", "ส่ง", "primary"), job = ctx.el("button", "🎯 สั่งงาน");
    const go = async tags => {
      const content = text.value.trim();
      if (!content) return ctx.popup(tags ? "พิมพ์เป้าหมายงานก่อน" : "พิมพ์ข้อความก่อน");
      send.disabled = job.disabled = true;
      try {
        await post({content, log_type: "question", ...(root ? {parent_argument_id: root} : {}), ...(tags ? {tags} : {})});
        text.value = "";
      } catch (e) { ctx.popup(e.message); } finally { send.disabled = job.disabled = false; }
    };
    send.onclick = () => go(null);
    job.onclick = () => go(["job"]);
    act.append(send, job);
    if (root) {
      const compact = ctx.el("button", "🗜 สรุปแชท");
      compact.onclick = async () => { compact.disabled = true; try { await post({content: "/compact", log_type: "question", parent_argument_id: root}); } catch (e) { ctx.popup(e.message); } };
      act.append(compact);
    }
    box.append(text, act);
    return box;
  }

  function message(i) {
    const m = ctx.el("div", null, `rm-msg${i.agent_id ? "" : " me"}${i.log_type === "blocker" ? " bad" : ""}`);
    m.append(ctx.el("div", i.agent_id ? `${markOf(i)} ${nameOf(i)}` : "👤 พี่โอม", "rm-who"), ctx.el("div", i.content || ""));
    const u = usageOf(i);
    if (u && u.reported) m.append(ctx.el("div", `${k(tokens(u))} token${u.seconds ? ` · ${Math.round(u.seconds)} วิ` : ""}${u.subagents ? ` · ผู้ช่วย ${u.subagents}` : ""}`, "meta"));
    if ((i.tags || []).includes("job-plan") && u && u.task_id) m.append(jobCard(u.task_id));
    return m;
  }

  function jobCard(taskId) {
    const box = ctx.el("div", "กำลังโหลดเช็คลิสต์…", "card");
    ctx.api(`/tasks/${encodeURIComponent(taskId)}`).then(task => {
      const job = (task.context || {}).job || {}, steps = job.steps || [];
      const done = steps.filter(s => s.status === "done").length;
      const key = `${job.state}|${done}|${steps.length}|${job.mode || ""}`;
      const list = ctx.el("div", null, "rm-steps");
      steps.forEach((s, n) => list.append(ctx.el("div", `${STEP[s.status] || "☐"} ${n + 1}. ${s.title} — ${s.owner}`)));
      const act = ctx.el("div", null, "act");
      const button = (label, tag, mode, primary) => {
        const b = ctx.el("button", label, primary ? "primary" : "");
        b.onclick = async () => {
          act.querySelectorAll("button").forEach(x => { x.disabled = true; });
          try {
            await post({content: label + " (จากมือถือ)", log_type: "question", parent_argument_id: openRoot, tags: [tag],
              ref_code: JSON.stringify({task_id: taskId, expect: key, ...(mode ? {mode} : {})})});
          } catch (e) { ctx.popup(e.message); }
        };
        return b;
      };
      if (job.state === "proposed" || job.state === "paused" || job.state === "blocked")
        act.append(button("▶ ทำทีละขั้น", "job-go", "step", true), button("⏩ Auto จนเสร็จ", "job-go", "auto"), button("✕ ยกเลิก", "job-cancel"));
      if (job.state === "running" && job.mode === "auto") act.append(button("⏸ หยุดหลังขั้นนี้", "job-go", "pause"));
      if (job.state === "review") act.append(button("✓ รับงาน", "job-accept", null, true), button("✕ ยกเลิก", "job-cancel"));
      box.replaceChildren(ctx.el("b", `${JOB_STATE[job.state] || job.state} · ${done}/${steps.length}`), list, ...(act.childElementCount ? [act] : []));
    }).catch(e => { box.textContent = "โหลดเช็คลิสต์ไม่ได้: " + e.message; });
    return box;
  }

  function thread(view) {
    const root = items.find(i => i.id === openRoot);
    if (!root) { mode = "list"; return list(view); }
    const t = threadOf(openRoot), nodes = [];
    let group = null;
    for (const i of t) {
      if (!isDraft(i)) { group = null; nodes.push(message(i)); continue; }
      if (!group) { group = ctx.el("details", null, "rm-drafts"); group.append(ctx.el("summary", "ความเห็นลูกทีม")); group.names = []; nodes.push(group); }
      group.append(message(i)); group.names.push(nameOf(i));
      group.querySelector("summary").textContent = `ความเห็นลูกทีม (${group.names.length}): ${[...new Set(group.names)].join(", ")}`;
    }
    if (stateOf(openRoot) === "waiting") nodes.push(ctx.el("p", "ทีมกำลังตอบ…", "meta"));
    const tabs = ctx.el("div", null, "act");
    const showActivity = ctx.el("button", "📊 การทำงาน");
    showActivity.onclick = () => { mode = "activity"; lastKey = ""; draw(); };
    const back = ctx.el("button", "← แชททั้งหมด"); back.onclick = () => { mode = "list"; lastKey = ""; draw(); };
    tabs.append(back, showActivity);
    view.replaceChildren(ctx.el("h2", title(root)), tabs, ...nodes, sender(openRoot));
  }

  // Who did what in this chat: each reply in order with role, model, time, tokens, helpers; totals at the end.
  function activity(view) {
    const t = threadOf(openRoot).filter(i => i.agent_id);
    const card = ctx.el("div", null, "card");
    card.append(ctx.el("h2", "การทำงานในแชทนี้"));
    let sum = 0, secs = 0, helpers = 0, unknown = 0;
    for (const i of t) {
      const u = usageOf(i) || {}, tags = i.tags || [];
      const what = tags.includes("job-plan") ? "วางแผน" : tags.includes("job-report") ? "หัวหน้าตรวจ/รายงาน"
        : tags.includes("job-progress") ? (tags.includes("usage") ? "ทำขั้นงาน" : "อัปเดตงาน") : tags.includes("compact") ? "สรุปแชท" : isDraft(i) ? "ความเห็นลูกทีม" : "ตอบ";
      const row = ctx.el("div", null, "rm-phase");
      row.append(ctx.el("span", `${markOf(i)} ${nameOf(i)} · ${what}`),
        ctx.el("span", [u.model, u.seconds ? Math.round(u.seconds) + " วิ" : null, u.reported ? k(tokens(u)) : "ไม่รายงาน token",
          u.subagents == null ? null : `ผู้ช่วย ${u.subagents}`].filter(Boolean).join(" · ")));
      card.append(row);
      sum += tokens(u); secs += u.seconds || 0; helpers += u.subagents || 0; if (u.reported === false || !u.provider) unknown++;
    }
    card.append(ctx.el("div", `รวม ${k(sum)} token · ${Math.round(secs)} วิ · เรียกผู้ช่วย ${helpers} ครั้ง${unknown ? ` · ${unknown} รายการไม่รายงานตัวเลข` : ""}`, "sub"));
    const back = ctx.el("button", "← กลับไปที่แชท");
    back.onclick = () => { mode = "thread"; lastKey = ""; draw(); };
    view.replaceChildren(back, card);
  }

  function draw() {
    const view = ctx.view;
    if (mode === "list") { ctx.tg.BackButton.hide(); list(view); return; }
    ctx.tg.BackButton.show();
    if (onBack) ctx.tg.BackButton.offClick(onBack);  // one handler, not one more per redraw
    onBack = () => { mode = mode === "activity" ? "thread" : "list"; lastKey = ""; draw(); };
    ctx.tg.BackButton.onClick(onBack);
    (mode === "activity" ? activity : thread)(view);
  }

  async function refresh() {
    if (!ctx.view.isConnected) { clearInterval(timer); timer = null; return; }  // another tab replaced the view
    await load();
    const key = items.map(i => i.id).join(",") + "|" + mode + "|" + openRoot;
    if (key !== lastKey) { lastKey = key; draw(); }
  }

  window.MoonRoom = {
    stop() { clearInterval(timer); timer = null; if (onBack && ctx) ctx.tg.BackButton.offClick(onBack); onBack = null; },
    async render(view, helpers) {
      // Draw into our own box: when another tab replaces the view, the box disconnects and polling stops.
      const box = helpers.el("div");
      view.replaceChildren(box);
      ctx = {...helpers, view: box};
      box.replaceChildren(ctx.el("p", "กำลังโหลดห้องกลาง…", "meta"));
      mode = "list"; openRoot = null; lastKey = "";
      try { await refresh(); } catch (e) { box.replaceChildren(ctx.el("p", e.message, "err")); return; }
      clearInterval(timer);
      // Poll while the tab is open (the gate closes WebSockets); stop as soon as another tab is shown.
      timer = setInterval(() => refresh().catch(() => {}), 8000);
    },
  };
})();
