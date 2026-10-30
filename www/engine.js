/* engine.js - Discord quest API client + runners. Improved stability for high-value quests. */
(function (root) {
  'use strict';
  const CFG = Object.assign({
    api: 'https://discord.com/api/v9', build: 528000, videoSpeed: 6, videoMaxFuture: 12, videoTick: 1100,
    hbActivity: 18000, hbPlay: 45000, stallBeats: 12, maxRetries: 5, gatewayWait: 2500
  }, root.QE_CFG || {});
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return 'UTC'; } })();
  const SUPER = btoa(JSON.stringify({
    os: 'Windows', browser: 'Discord Client', device: '', system_locale: 'en-US', has_client_mods: false,
    browser_user_agent: UA, browser_version: '131.0.0.0', os_version: '10.0.19045', referrer: '',
    referring_domain: '', referrer_current: '', referring_domain_current: '',
    release_channel: 'stable', client_build_number: CFG.build, client_event_source: null, client_version: '1.0.9188'
  }));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const native = () => { const c = root.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.CapacitorHttp; };
  async function rawRequest(method, path, headers, body) {
    const url = CFG.api + path; const plug = native();
    if (plug) {
      const res = await plug.request({ url, method, headers: Object.assign({ 'User-Agent': UA }, headers), data: body, responseType: 'json' });
      let data = res.data; if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) {} }
      return { status: res.status, data };
    }
    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let data = null; try { data = await res.json(); } catch (e) {}
    return { status: res.status, data };
  }
  let fpCache = null, fpPromise = null;
  function ensureFingerprint() {
    if (fpCache) return Promise.resolve(fpCache);
    if (!fpPromise) {
      fpPromise = rawRequest('POST', '/auth/fingerprint', {
        'Content-Type': 'application/json', 'X-Super-Properties': SUPER,
        'X-Discord-Locale': 'en-US', 'X-Discord-Timezone': tz, 'Accept-Language': 'en-US,en;q=0.9'
      }).then(r => { fpCache = (r.data && r.data.fingerprint) || null; return fpCache; }).catch(() => null).finally(() => { fpPromise = null; });
    }
    return fpPromise;
  }
  async function http(token, method, path, body) {
    const fp = await ensureFingerprint();
    const headers = { 'Authorization': token, 'Content-Type': 'application/json', 'X-Super-Properties': SUPER, 'X-Discord-Locale': 'en-US', 'X-Discord-Timezone': tz, 'Accept-Language': 'en-US,en;q=0.9' };
    if (fp) headers['X-Fingerprint'] = fp;
    for (let attempt = 0; attempt < CFG.maxRetries; attempt++) {
      const { status, data } = await rawRequest(method, path, headers, body);
      if (status === 429) { await sleep(((data && data.retry_after) || 2) * 1000 + 300 + Math.random() * 400); continue; }
      if (status >= 500 && attempt < CFG.maxRetries - 1) { await sleep(1000 + attempt * 800); continue; }
      return { status, data };
    }
    return { status: 429, data: { message: 'rate limited' } };
  }
  const Api = {
    me: t => http(t, 'GET', '/users/@me'), guilds: t => http(t, 'GET', '/users/@me/guilds'),
    balance: t => http(t, 'GET', '/users/@me/virtual-currency/balance'), quests: t => http(t, 'GET', '/quests/@me'),
    channels: t => http(t, 'GET', '/users/@me/channels'), guildChannels: (t, id) => http(t, 'GET', `/guilds/${id}/channels`),
    enroll: (t, id) => http(t, 'POST', `/quests/${id}/enroll`, { location: 11, is_targeted: false, metadata_raw: null }),
    video: (t, id, timestamp) => http(t, 'POST', `/quests/${id}/video-progress`, { timestamp }),
    heartbeat: (t, id, body) => http(t, 'POST', `/quests/${id}/heartbeat`, body)
  };
  function errMsg(r) {
    const d = r && r.data; if (!d) return `HTTP ${r && r.status}`;
    if (typeof d === 'string') return d; if (d.message) return d.message; if (d.code) return `Error ${d.code}`;
    return JSON.stringify(d).slice(0, 120);
  }
  function snowflakeDate(id) { try { return new Date(Number((BigInt(id) >> 22n) + 1420070400000n)); } catch (e) { return new Date(); } }
  const TASKS = ['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE', 'PLAY_ACTIVITY', 'PLAY_ON_DESKTOP', 'STREAM_ON_DESKTOP'];
  const SUPPORTED = ['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE', 'PLAY_ACTIVITY', 'PLAY_ON_DESKTOP', 'STREAM_ON_DESKTOP'];
  function rewardInfo(rewards) {
    const orb = rewards.find(r => r.type === 4 || r.orb_quantity != null || /orb/i.test((r.messages && (r.messages.name || r.messages.name_with_article)) || ''));
    const r = orb || rewards[0]; if (!r) return { label: '-', isOrbs: false, qty: 0 };
    const name = (r.messages && (r.messages.name || r.messages.name_with_article)) || '';
    let qty = Number(r.orb_quantity) || 0;
    if (!qty && orb) { const m = name.match(/[\d,]+/); if (m) qty = Number(m[0].replace(/,/g, '')) || 0; }
    return { label: orb ? (qty ? `${qty} Orbs` : (name || 'Orbs')) : (name || 'جايزة'), isOrbs: !!orb, qty };
  }
  function normalize(q) {
    const c = q.config || {}; const tasks = ((c.task_config_v2 || c.task_config || {}).tasks) || {};
    let type = TASKS.find(k => tasks[k]) || Object.keys(tasks)[0] || 'UNKNOWN';
    const runType = (type === 'STREAM_ON_DESKTOP') ? 'PLAY_ON_DESKTOP' : type;
    const us = q.user_status || null; const rw = rewardInfo((c.rewards_config && c.rewards_config.rewards) || []);
    const msgs = c.messages || {}; const app = c.application || {};
    return {
      id: q.id, name: msgs.quest_name || app.name || 'Quest', game: msgs.game_title || app.name || '', appId: app.id,
      type, runType, target: (tasks[type] && tasks[type].target) || (tasks[runType] && tasks[runType].target) || 0,
      supported: SUPPORTED.includes(type), experimental: type === 'PLAY_ON_DESKTOP' || type === 'STREAM_ON_DESKTOP',
      starts: c.starts_at ? Date.parse(c.starts_at) : 0, expires: c.expires_at ? Date.parse(c.expires_at) : Infinity,
      enrolledAt: us && us.enrolled_at ? Date.parse(us.enrolled_at) : null, completed: !!(us && us.completed_at),
      progress: (us && us.progress && (us.progress[type] || us.progress[runType]) && (us.progress[type] || us.progress[runType]).value) || 0,
      reward: rw.label, isOrbs: rw.isOrbs, orbsQty: rw.qty, state: 'idle', err: ''
    };
  }
  async function loadQuests(token) {
    const r = await Api.quests(token); if (r.status !== 200) throw new Error(errMsg(r));
    const d = r.data; const list = Array.isArray(d) ? d : ((d && d.quests) || []); const now = Date.now();
    return list.map(normalize).filter(q => !q.completed && q.expires > now && q.starts <= now);
  }
  class Job {
    constructor(token, quest, hooks) {
      this.t = token; this.q = quest; this.h = Object.assign({ onProgress() {}, onLog() {}, onEnrolled() {} }, hooks);
      this.stopped = false; this._wake = null; this._gw = null;
    }
    stop() { this.stopped = true; if (this._wake) this._wake(); if (this._gw) { try { this._gw.stopGame(); this._gw.close(); } catch (e) {} this._gw = null; } }
    sleep(ms) { return new Promise(res => { const t = setTimeout(res, ms); this._wake = () => { clearTimeout(t); res(); }; }); }
    async run() {
      const q = this.q;
      if (!q.enrolledAt) {
        this.h.onLog('بشترك في الكويست...');
        for (let i = 0; i < 3; i++) {
          const r = await Api.enroll(this.t, q.id);
          if (r.status >= 300) { if (i === 2) throw new Error(errMsg(r)); await this.sleep(1500); continue; }
          const us = r.data && r.data.enrolled_at ? r.data : null;
          q.enrolledAt = us ? Date.parse(us.enrolled_at) : Date.now(); this.h.onEnrolled();
          if (us && us.completed_at) return 'done'; break;
        }
      }
      const rt = q.runType || q.type;
      if (rt === 'WATCH_VIDEO' || rt === 'WATCH_VIDEO_ON_MOBILE') return this.video();
      if (rt === 'PLAY_ACTIVITY') return this.beats('activity');
      if (rt === 'PLAY_ON_DESKTOP' || rt === 'STREAM_ON_DESKTOP') return this.beatsWithGateway();
      throw new Error('النوع ده مش مدعوم: ' + q.type);
    }
    async video() {
      const q = this.q, need = q.target; let done = q.progress, completed = false;
      this.h.onLog(`فيديو: ${done}/${need}s`);
      while (!this.stopped) {
        const allowed = Math.floor((Date.now() - q.enrolledAt) / 1000) + CFG.videoMaxFuture;
        const ts = done + CFG.videoSpeed;
        if (allowed - done >= CFG.videoSpeed) {
          const r = await Api.video(this.t, q.id, Math.min(need, ts + Math.random() * 0.8));
          if (r.status >= 300) throw new Error(errMsg(r));
          completed = !!(r.data && r.data.completed_at); done = Math.min(need, ts); this.h.onProgress(done);
          if (completed) return 'done';
        }
        if (ts >= need) break; await this.sleep(CFG.videoTick);
      }
      if (this.stopped) return 'stopped';
      if (!completed) { const r = await Api.video(this.t, q.id, need); if (r.status >= 300) throw new Error(errMsg(r)); }
      this.h.onProgress(need); return 'done';
    }
    async findChannel() {
      const dm = await Api.channels(this.t);
      if (dm.status === 200 && Array.isArray(dm.data) && dm.data.length) return dm.data[0].id;
      const g = await Api.guilds(this.t);
      if (g.status === 200 && Array.isArray(g.data)) {
        for (const guild of g.data.slice(0, 8)) {
          const c = await Api.guildChannels(this.t, guild.id);
          const v = c.status === 200 && Array.isArray(c.data) && c.data.find(x => x.type === 2);
          if (v) return v.id;
        }
      }
      return null;
    }
    async beats(kind) {
      const q = this.q; let mk, every;
      if (kind === 'activity') {
        const ch = await this.findChannel(); if (!ch) throw new Error('مفيش DM ولا قناة صوت أستخدمها');
        mk = terminal => ({ stream_key: `call:${ch}:1`, terminal }); every = CFG.hbActivity;
      } else { mk = terminal => ({ application_id: q.appId, terminal }); every = CFG.hbPlay; }
      let last = -1, stalls = 0, consecutiveErrors = 0;
      while (!this.stopped) {
        let r;
        try { r = await Api.heartbeat(this.t, q.id, mk(false)); } catch (e) {
          consecutiveErrors++; this.h.onLog('خطأ heartbeat: ' + (e.message || e));
          if (consecutiveErrors >= 4) throw e; await this.sleep(3000); continue;
        }
        consecutiveErrors = 0;
        if (r.status >= 300) { if (r.status === 400 || r.status === 429) { await this.sleep(2500); continue; } throw new Error(errMsg(r)); }
        const pr = r.data && r.data.progress && (r.data.progress[q.type] || r.data.progress[q.runType]);
        const p = pr && typeof pr.value === 'number' ? pr.value : null;
        if (p !== null) { this.h.onProgress(p); this.h.onLog(`heartbeat ${p}/${q.target}s`); }
        if ((r.data && r.data.completed_at) || (p !== null && p >= q.target)) {
          try { await Api.heartbeat(this.t, q.id, mk(true)); } catch (e) {}
          this.h.onProgress(q.target); return 'done';
        }
        if (p !== null && p !== last) { stalls = 0; last = p; } else stalls++;
        if (stalls >= CFG.stallBeats) {
          try { await Api.heartbeat(this.t, q.id, mk(true)); } catch (e) {}
          throw new Error(kind === 'play' ? 'السيرفر مش بيحسب التقدم حتى مع الـ Gateway' : 'السيرفر مش بيحسب التقدم');
        }
        await this.sleep(every + Math.random() * 1500);
      }
      return 'stopped';
    }
    async beatsWithGateway() {
      if (!root.QGateway) throw new Error('gateway.js مش متحمّل');
      const q = this.q; const gw = new root.QGateway(this.t); gw.onLog = m => this.h.onLog(m); this._gw = gw;
      try {
        this.h.onLog('بتصل بـ Gateway...'); await gw.connect();
        gw.playGame(q.appId, q.game || q.name); await this.sleep(800);
        gw.playGame(q.appId, q.game || q.name); await this.sleep(CFG.gatewayWait);
        this.h.onLog('Presence اتبعت، ببدأ الـ heartbeats...'); return await this.beats('play');
      } finally { try { gw.stopGame(); } catch (e) {} try { gw.close(); } catch (e) {} this._gw = null; }
    }
  }
  root.QE = { CFG, Api, http, loadQuests, normalize, Job, errMsg, snowflakeDate };
})(typeof window !== 'undefined' ? window : globalThis);
