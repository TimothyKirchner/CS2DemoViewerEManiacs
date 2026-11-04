// Minimal obs-websocket v5 client (OBS 28+, Tools → WebSocket Server Settings).
import crypto from "node:crypto";

export class Obs {
  async connect(url = "ws://127.0.0.1:4455", password = "") {
    this.ws = new WebSocket(url); this.pending = new Map(); this.seq = 0;
    await new Promise((resolve, reject) => {
      this.ws.onerror = () => reject(new Error(`Could not reach OBS at ${url}. Enable the WebSocket server in OBS.`));
      this.ws.onmessage = ({data}) => {
        const m = JSON.parse(data);
        if (m.op === 0) {
          const auth = m.d.authentication, identify = {rpcVersion: 1};
          if (auth) {
            const secret = crypto.createHash("sha256").update(password + auth.salt).digest("base64");
            identify.authentication = crypto.createHash("sha256").update(secret + auth.challenge).digest("base64");
          }
          this.ws.send(JSON.stringify({op: 1, d: identify}));
        } else if (m.op === 2) resolve();
        else if (m.op === 7) { const p = this.pending.get(m.d.requestId); if (p) { this.pending.delete(m.d.requestId); m.d.requestStatus.result ? p.resolve(m.d.responseData ?? {}) : p.reject(new Error(`OBS ${m.d.requestType}: ${m.d.requestStatus.comment ?? m.d.requestStatus.code}`)); } }
      };
      this.ws.onclose = e => reject(new Error(`OBS closed the connection (${e.code}). Check the WebSocket password.`));
    });
  }
  request(requestType, requestData = {}) {
    const requestId = String(++this.seq);
    return new Promise((resolve, reject) => { this.pending.set(requestId, {resolve, reject}); this.ws.send(JSON.stringify({op: 6, d: {requestType, requestId, requestData}})); });
  }
  close() { this.ws?.close(); }
}
