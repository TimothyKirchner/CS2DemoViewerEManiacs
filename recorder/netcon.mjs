// Minimal client for CS2's TCP console (launch option -netconport <port>).
import net from "node:net";

export class Netcon {
  constructor() { this.buffer = ""; this.waiters = []; this.log = []; }
  async connect(port, {host = "127.0.0.1", timeoutMs = 180000, retryMs = 1000} = {}) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      try { await this.open(host, port); return this; }
      catch (e) { if (Date.now() > until) throw new Error(`CS2 console did not open on port ${port}: ${e.message}`); await sleep(retryMs); }
    }
  }
  open(host, port) {
    return new Promise((resolve, reject) => {
      const s = net.connect({host, port});
      s.once("error", reject);
      s.once("connect", () => { s.off("error", reject); s.on("error", () => {}); this.socket = s; resolve(); });
      s.setEncoding("utf8");
      s.on("data", d => {
        this.buffer += d; const lines = this.buffer.split(/\r?\n/); this.buffer = lines.pop();
        for (const line of lines) { this.log.push(line); for (const w of [...this.waiters]) if (w.re.test(line)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(line); } }
        if (this.log.length > 5000) this.log.splice(0, 1000);
      });
    });
  }
  send(command) { if (!this.socket) throw new Error("Console not connected"); this.socket.write(command + "\n"); }
  waitFor(re, timeoutMs) {
    return new Promise(resolve => {
      const w = {re, resolve}; this.waiters.push(w);
      setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); resolve(null); } }, timeoutMs);
    });
  }
  close() { this.socket?.end(); this.socket = null; }
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
