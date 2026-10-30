/* app.js - UI layer */
(function () {
  'use strict';
  const QE = window.QE;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'qo.tokens.v1';

  const S = { token: null, me: null, quests: [], orbsOnly: false, balance: null, guilds: null, sessionDone: 0, sessionOrbs: 0 };
  const jobs = new Map();

  /* ---------------- storage ---------------- */
  function loadSaved() {
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(x => x && typeof x.token === 'string') : []; }
    catch (e) { return []; }
  }
  function writeSaved(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* storage blocked */ } }
  function saveAccount(token, me) {
    const list = loadSaved();
    const meta = { token, id: me.id, name: me.global_name || me.username, avatar: avatarUrl(me, 64) };
    const i = list.findIndex(x => x.token === token);   // same token => update in place, never a 2nd entry
    if (i >= 0) list[i] = meta; else list.unshift(meta);
    writeSaved(list);
  }
  const mask = t => t.length > 14 ? `${t.slice(0, 6)}••••••${t.slice(-4)}` : '••••••';
  const clean = t => String(t || '').trim().replace(/^["'`]+|["'`]+$/g, '');

  /* ---------------- helpers ---------------- */
  function avatarUrl(me, size) {
    if (me.avatar) return `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.${me.avatar.startsWith('a_') ? 'gif' : 'png'}?size=${size || 128}`;
    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(me.id) >> 22n) % 6n)}.png`;
  }
  let toastT;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
  const logLines = [];
  function log(m) {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    logLines.push(`[${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}] ${m}`);
    if (logLines.length > 120) logLines.shift();
    const el = $('#log'); if (el) { el.textContent = logLines.join('\n'); el.scrollTop = el.scrollHeight; }
  }
  function fmtSec(s) { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function rel(ms) {
    const d = ms - Date.now();
    if (!isFinite(d)) return '';
    if (d <= 0) return 'منتهي';
    const m = d / 60000;
    if (m < 60) return `ينتهي بعد ${Math.ceil(m)} دقيقة`;
    if (m < 1440) return `ينتهي بعد ${Math.floor(m / 60)} ساعة`;
    return `ينتهي بعد ${Math.floor(m / 1440)} يوم`;
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e2) { /* */ } a.remove(); }
    toast('اتنسخ');
  }

  /* ---------------- login ---------------- */
  function renderSaved() {
    const list = loadSaved(), box = $('#saved'), cur = $('#tok').value.trim();
    $('#savedCount').textContent = list.length ? `(${list.length})` : '';
    if (!list.length) { box.innerHTML = '<div class="empty">لسه مفيش حسابات - أي حساب تدخل بيه هيتحفظ هنا</div>'; return; }
    box.innerHTML = list.map((a, i) =>
      `<div class="chip${a.token === cur ? ' on' : ''}" data-i="${i}" role="button">
         <img src="${esc(a.avatar)}" alt="">
         <div class="cm"><b>${esc(a.name)}</b><small dir="ltr">${esc(mask(a.token))}</small></div>
         <button class="x" data-del="${i}" type="button" aria-label="حذف">✕</button>
       </div>`).join('');
  }
  $('#saved').addEventListener('click', e => {
    const list = loadSaved();
    const d = e.target.closest('[data-del]');
    if (d) { list.splice(+d.dataset.del, 1); writeSaved(list); renderSaved(); return; }
    const c = e.target.closest('.chip');
    if (c && list[+c.dataset.i]) { $('#tok').value = list[+c.dataset.i].token; hideErr(); renderSaved(); }
  });
  $('#tok').addEventListener('input', renderSaved);
  $('#eye').addEventListener('click', () => { const t = $('#tok'); t.type = t.type === 'password' ? 'text' : 'password'; });
  $('#paste').addEventListener('click', async () => {
    try { $('#tok').value = clean(await navigator.clipboard.readText()); renderSaved(); }
    catch (e) { toast('الصق بإيدك - الكليبورد مش متاح'); $('#tok').focus(); }
  });
  $('#tok').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  $('#loginBtn').addEventListener('click', login);

  function showErr(m) { const e = $('#loginErr'); e.textContent = m; e.classList.remove('hide'); }
  function hideErr() { $('#loginErr').classList.add('hide'); }

  async function login() {
    const token = clean($('#tok').value);
    if (!token) return showErr('الصق التوكن الأول');
    hideErr();
    const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'بدخّل...';
    try {
      const r = await QE.Api.me(token);
      if (r.status === 401 || r.status === 403) return showErr('التوكن غلط أو منتهي');
      if (r.status !== 200 || !r.data || !r.data.id) return showErr(QE.errMsg(r));
      S.token = token; S.me = r.data;
      saveAccount(token, r.data);
      S.balance = null; S.guilds = null; S.sessionDone = 0; S.sessionOrbs = 0;
      $('#loginView').classList.add('hide'); $('#dashView').classList.remove('hide'); $('#switchBtn').classList.remove('hide');
      renderProfile();
      log(`دخلت بحساب ${r.data.username}`);
      loadExtras();
      refreshQuests();
    } catch (e) {
      showErr('مفيش اتصال بالنت أو ديسكورد مش بيرد');
    } finally { btn.disabled = false; btn.textContent = 'دخول'; }
  }

  $('#switchBtn').addEventListener('click', () => {
    jobs.forEach(j => j.stop());
    S.token = null; S.me = null; S.quests = [];
    $('#dashView').classList.add('hide'); $('#loginView').classList.remove('hide'); $('#switchBtn').classList.add('hide');
    $('#tok').value = ''; renderSaved();
  });

  /* ---------------- profile ---------------- */
  async function loadExtras() {
    const t = S.token;
    try { const r = await QE.Api.balance(t); if (r.status === 200 && r.data && typeof r.data.balance === 'number') S.balance = r.data.balance; } catch (e) { /* */ }
    try { const r = await QE.Api.guilds(t); if (r.status === 200 && Array.isArray(r.data)) S.guilds = r.data.length; } catch (e) { /* */ }
    if (S.token === t) renderProfile();
  }
  const NITRO = { 1: 'Nitro Classic', 2: 'Nitro', 3: 'Nitro Basic' };
  function renderProfile() {
    const me = S.me; if (!me) return;
    const created = QE.snowflakeDate(me.id);
    const years = Math.floor((Date.now() - created) / 31557600000);
    const color = me.banner_color || (me.accent_color != null ? '#' + me.accent_color.toString(16).padStart(6, '0') : '#4a55d8');
    const bg = me.banner
      ? `url(https://cdn.discordapp.com/banners/${me.id}/${me.banner}.${me.banner.startsWith('a_') ? 'gif' : 'png'}?size=480)`
      : `linear-gradient(135deg,${esc(color)},#a86bff)`;
    const phone = me.phone ? '•••• ' + String(me.phone).slice(-3) : 'مش مربوط';
    const badges = [
      NITRO[me.premium_type] ? `<span class="bd nitro">✦ ${NITRO[me.premium_type]}</span>` : '',
      me.mfa_enabled ? '<span class="bd ok">🔒 2FA شغّال</span>' : '<span class="bd bad">2FA مقفول</span>',
      me.verified ? '<span class="bd ok">✓ الإيميل متأكد</span>' : '<span class="bd bad">الإيميل مش متأكد</span>',
      me.locale ? `<span class="bd">${esc(me.locale)}</span>` : ''
    ].join('');
    $('#profile').innerHTML = `
      <div class="pbanner" style="background-image:${bg}"></div>
      <div class="pmain">
        <img src="${esc(avatarUrl(me, 256))}" alt="">
        <div class="pname"><b>${esc(me.global_name || me.username)}</b><span dir="ltr">@${esc(me.username)}</span></div>
      </div>
      <div class="badges">${badges}</div>
      <div class="pgrid">
        <div class="pbox orb"><small>رصيد الـ Orbs</small><b>${S.balance == null ? '—' : S.balance.toLocaleString('en-US')}</b></div>
        <div class="pbox"><small>السيرفرات</small><b>${S.guilds == null ? '—' : S.guilds}</b></div>
      </div>
      <div class="rows">
        <div class="row copy" data-copy="${esc(me.id)}"><span>ID (اضغط للنسخ)</span><b>${esc(me.id)}</b></div>
        <div class="row"><span>الإيميل</span><b>${esc(me.email || '—')}</b></div>
        <div class="row"><span>الموبايل</span><b>${esc(phone)}</b></div>
        <div class="row"><span>اتعمل في</span><b>${years} سنة · ${esc(created.toLocaleDateString('en-GB'))}</b></div>
      </div>`;
  }
  $('#profile').addEventListener('click', e => { const r = e.target.closest('[data-copy]'); if (r) copy(r.dataset.copy); });

  /* ---------------- quests ---------------- */
  const TYPE_AR = { WATCH_VIDEO: 'مشاهدة فيديو', WATCH_VIDEO_ON_MOBILE: 'مشاهدة فيديو', PLAY_ACTIVITY: 'لعب نشاط', PLAY_ON_DESKTOP: 'لعب على الديسكتوب', STREAM_ON_DESKTOP: 'بث على الديسكتوب' };

  function visible() {
    return S.quests
      .filter(q => (!q.completed || q.state === 'done') && (!S.orbsOnly || q.isOrbs))
      .sort((a, b) => (b.supported - a.supported) || (a.expires - b.expires));
  }

  async function refreshQuests() {
    const t = S.token; if (!t) return;
    $('#refresh').disabled = true;
    try {
      const fresh = await QE.loadQuests(t);
      if (S.token !== t) return;
      const old = new Map(S.quests.map(q => [q.id, q]));
      const keep = S.quests.filter(q => q.state === 'done' && !fresh.some(f => f.id === q.id));
      S.quests = fresh.map(f => (old.has(f.id) && jobs.has(f.id)) ? old.get(f.id) : f).concat(keep);
      log(`اتحمّل ${fresh.length} كويست`);
    } catch (e) { toast(e.message || 'فشل تحميل الكويستات'); log('فشل التحميل: ' + e.message); }
    finally { $('#refresh').disabled = false; }
    renderQuests();
  }

  function renderQuests() {
    const list = visible(), box = $('#quests');
    $('#qcount').textContent = `(${list.length})`;
    if (!list.length) {
      box.innerHTML = `<div class="nothing">${S.orbsOnly ? 'مفيش كويستات Orbs دلوقتي' : 'مفيش كويستات متاحة دلوقتي 🎉'}</div>`;
      renderStats(); return;
    }
    box.innerHTML = '';
    for (const q of list) {
      const el = document.createElement('div');
      el.className = 'q'; el.id = 'q-' + q.id;
      el.innerHTML = `
        <div class="qt">
          <div class="n"><b>${esc(q.game || q.name)}</b><small>${esc(q.name)}</small></div>
          <div class="reward${q.isOrbs ? '' : ' other'}" dir="ltr">${q.isOrbs ? '◈ ' : ''}${esc(q.reward)}</div>
        </div>
        <div class="meta">
          <span class="tg">${esc(TYPE_AR[q.type] || q.type)}</span>
          ${q.experimental ? '<span class="tg warn">تجريبي</span>' : ''}
          <span class="tg" data-role="exp"></span>
        </div>
        <div class="bar"><i data-role="fill"></i></div>
        <div class="pt"><span data-role="ptxt"></span><span data-role="pct"></span></div>
        <div class="st" data-role="st"></div>
        <button class="qb" type="button" data-role="btn"></button>`;
      box.appendChild(el);
      paint(q);
    }
    renderStats();
  }

  function paint(q) {
    const el = document.getElementById('q-' + q.id); if (!el) return;
    const pct = q.target ? Math.min(100, Math.floor(q.progress / q.target * 100)) : 0;
    const r = k => el.querySelector(`[data-role=${k}]`);
    el.classList.toggle('running', q.state === 'running');
    el.classList.toggle('done', q.state === 'done');
    el.classList.toggle('error', q.state === 'error');
    el.classList.toggle('unsup', !q.supported);
    r('exp').textContent = rel(q.expires);
    r('fill').style.width = pct + '%';
    r('ptxt').textContent = q.target ? `${fmtSec(q.progress)} / ${fmtSec(q.target)}` : '';
    r('ptxt').dir = 'ltr'; r('pct').dir = 'ltr';
    r('pct').textContent = pct + '%';
    const st = r('st'), btn = r('btn');
    st.className = 'st';
    if (!q.supported) { st.textContent = 'النوع ده مش مدعوم من الموبايل'; btn.textContent = 'مش مدعوم'; btn.className = 'qb off'; btn.disabled = true; return; }
    btn.disabled = false;
    if (q.state === 'running') {
      st.textContent = q.enrolledAt ? 'شغّال دلوقتي...' : 'بشترك...';
      btn.textContent = '■ إيقاف'; btn.className = 'qb stop';
    } else if (q.state === 'done') {
      st.textContent = '✓ خلص - استلم الجايزة من تطبيق ديسكورد (Claim)'; st.classList.add('good');
      btn.textContent = 'تم'; btn.className = 'qb off'; btn.disabled = true;
    } else {
      if (q.state === 'error') { st.textContent = '⚠ ' + q.err; st.classList.add('bad'); }
      else st.textContent = q.enrolledAt ? (q.progress ? 'متوقف - هيكمل من مكانه' : 'مشترك - جاهز') : 'لسه ما اشتركتش (هيشترك تلقائي)';
      btn.textContent = q.state === 'error' ? '↻ حاول تاني' : (q.enrolledAt ? '▶ تشغيل' : '▶ اشترك وابدأ');
      btn.className = 'qb';
    }
  }

  function renderStats() {
    const running = jobs.size;
    $('#stats').innerHTML =
      `<div class="stat p"><b>${visible().filter(q => q.state !== 'done').length}</b><small>متاح</small></div>
       <div class="stat"><b>${running}</b><small>شغّال</small></div>
       <div class="stat g"><b>${S.sessionDone}</b><small>خلص${S.sessionOrbs ? ' · <span style="color:var(--orb)">' + S.sessionOrbs + ' ◈</span>' : ''}</small></div>`;
  }

  $('#quests').addEventListener('click', e => {
    const b = e.target.closest('[data-role=btn]'); if (!b) return;
    const q = S.quests.find(x => 'q-' + x.id === b.closest('.q').id); if (!q) return;
    if (jobs.has(q.id)) jobs.get(q.id).stop(); else startQuest(q);
  });

  function startQuest(q) {
    if (jobs.has(q.id) || !q.supported || q.state === 'done') return;
    const job = new QE.Job(S.token, q, {
      onProgress: v => { q.progress = v; paint(q); },
      onLog: m => log(`${q.game || q.name}: ${m}`),
      onEnrolled: () => paint(q)
    });
    jobs.set(q.id, job); q.state = 'running'; q.err = '';
    paint(q); renderStats(); wake();
    job.run().then(res => {
      if (res === 'done') {
        q.state = 'done'; q.completed = true; q.progress = q.target;
        S.sessionDone++; S.sessionOrbs += q.orbsQty || 0;
        log(`خلص: ${q.game || q.name}`);
        try { navigator.vibrate && navigator.vibrate([80, 60, 80]); } catch (e) { /* */ }
        toast(`✓ خلص ${q.game || q.name}`);
        loadExtras();
      } else { q.state = 'idle'; log(`وقف: ${q.game || q.name}`); }
    }).catch(e => {
      q.state = 'error'; q.err = e.message || 'خطأ غير معروف';
      log(`فشل ${q.game || q.name}: ${q.err}`);
    }).finally(() => { jobs.delete(q.id); paint(q); renderStats(); wake(); });
  }

  $('#runAll').addEventListener('click', () => {
    const todo = visible().filter(q => q.supported && q.state !== 'running' && q.state !== 'done');
    if (!todo.length) return toast('مفيش حاجة تشغّلها');
    todo.forEach((q, i) => setTimeout(() => startQuest(q), i * 600));
  });
  $('#stopAll').addEventListener('click', () => jobs.forEach(j => j.stop()));
  $('#refresh').addEventListener('click', refreshQuests);
  function setFilter(orbs) { S.orbsOnly = orbs; $('#fAll').classList.toggle('on', !orbs); $('#fOrbs').classList.toggle('on', orbs); renderQuests(); }
  $('#fAll').addEventListener('click', () => setFilter(false));
  $('#fOrbs').addEventListener('click', () => setFilter(true));

  /* keep screen on while anything runs (WebView timers get throttled in background) */
  let lock = null;
  async function wake() {
    try {
      if (jobs.size && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      else if (!jobs.size && lock) { await lock.release(); lock = null; }
    } catch (e) { /* unsupported */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });

  /* countdown labels */
  setInterval(() => S.quests.forEach(q => { const el = document.querySelector(`#q-${CSS.escape(q.id)} [data-role=exp]`); if (el) el.textContent = rel(q.expires); }), 30000);

  renderSaved();
})();
