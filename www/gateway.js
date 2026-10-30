/* gateway.js - improved */
(function (root) {
  'use strict';
  const OP = { DISPATCH: 0, HEARTBEAT: 1, IDENTIFY: 2, PRESENCE_UPDATE: 3, INVALID_SESSION: 9, HELLO: 10, HEARTBEAT_ACK: 11, RECONNECT: 7 };
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const GATEWAY = 'wss://gateway.discord.gg/?v=9&encoding=json';
  class GatewaySpoof {
    constructor(token) { this.token = token; this.ws = null; this.seq = null; this.hbTimer = null; this.hbAcked = true; this.ready = false; this.activity = null; this._closing = false; this.onLog = () => {}; }
    connect() {
      return new Promise((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => { if (!settled) { settled = true; reject(new Error('Gateway timeout')); try { this.ws.close(); } catch (e) {} } }, 15000);
        this.ws = new WebSocket(GATEWAY);
        this.ws.onopen = () => this.onLog('Gateway: متصل');
        this.ws.onerror = () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('Gateway error')); } };
        this.ws.onclose = () => { clearTimeout(this.hbTimer); this.ready = false; };
        this.ws.onmessage = (ev) => {
          let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
          if (msg.s != null) this.seq = msg.s;
          switch (msg.op) {
            case OP.HELLO: this._startHeartbeat(msg.d.heartbeat_interval); this._identify(); break;
            case OP.HEARTBEAT_ACK: this.hbAcked = true; break;
            case OP.HEARTBEAT: this._sendHeartbeat(); break;
            case OP.DISPATCH:
              if (msg.t === 'READY') {
                this.ready = true; this.onLog('Gateway: READY');
                if (this.activity) this._sendPresence(this.activity);
                if (!settled) { settled = true; clearTimeout(timeout); resolve(); }
              }
              break;
            case OP.INVALID_SESSION:
              if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('التوكن مرفوض من Gateway')); }
              try { this.ws.close(); } catch (e) {} break;
            case OP.RECONNECT: try { this.ws.close(); } catch (e) {} break;
          }
        };
      });
    }
    _send(obj) { if (this.ws && this.ws.readyState === WebSocket.OPEN) { try { this.ws.send(JSON.stringify(obj)); } catch (e) {} } }
    _sendHeartbeat() { this.hbAcked = false; this._send({ op: OP.HEARTBEAT, d: this.seq }); }
    _startHeartbeat(interval) {
      clearTimeout(this.hbTimer);
      this.hbTimer = setTimeout(() => {
        this._sendHeartbeat();
        this.hbTimer = setInterval(() => {
          if (!this.hbAcked) { this.onLog('Gateway: heartbeat ماترديش - بقفل'); try { this.ws.close(); } catch (e) {} return; }
          this._sendHeartbeat();
        }, interval);
      }, interval * Math.random());
    }
    _identify() {
      this._send({ op: OP.IDENTIFY, d: {
        token: this.token, capabilities: 16381,
        properties: { os: 'Windows', browser: 'Discord Client', release_channel: 'stable', client_version: '1.0.9188', os_version: '10.0.19045', client_build_number: 528000, browser_user_agent: UA, browser_version: '131.0.0.0', system_locale: 'en-US', device: '', device_vendor: '', device_model: '' },
        presence: { status: 'online', since: 0, activities: [], afk: false }, compress: false
      }});
    }
    playGame(appId, name) {
      const now = Date.now();
      this.activity = { name: name || 'Game', type: 0, application_id: String(appId), timestamps: { start: now - Math.floor(Math.random() * 40000) }, assets: {}, flags: 1, created_at: now };
      if (this.ready) this._sendPresence(this.activity);
    }
    _sendPresence(activity) {
      this._send({ op: OP.PRESENCE_UPDATE, d: { since: Date.now() - 30000, activities: activity ? [activity] : [], status: 'online', afk: false } });
    }
    stopGame() {
      this.activity = null;
      if (this.ready) this._send({ op: OP.PRESENCE_UPDATE, d: { since: 0, activities: [], status: 'online', afk: false } });
    }
    close() {
      this._closing = true; clearTimeout(this.hbTimer); clearInterval(this.hbTimer);
      if (this.ws) { try { this.ws.close(1000); } catch (e) {} }
    }
  }
  root.QGateway = GatewaySpoof;
})(typeof window !== 'undefined' ? window : globalThis);
