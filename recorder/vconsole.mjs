// Client for CS2's VConsole2 port (127.0.0.1:29000, open by default). CS2 ignores -netconport
// (it rewrites it to "xnetconport"), so this is the console the recorder drives.
// Packet: 4-char type, uint16 version, uint32 total length (incl. 12-byte header), uint16 handle.
import net from "node:net";
import {sleep} from "./netcon.mjs";

const VERSION = 0x00d4, PRNT_TEXT = 28;

export function encodeCommand(command) {
  const body = Buffer.from(command + "\0", "utf8"), head = Buffer.alloc(12);
  head.write("CMND", 0, "latin1"); head.writeUInt16BE(VERSION, 4); head.writeUInt32BE(12 + body.length, 6); head.writeUInt16BE(0, 10);
  return Buffer.concat([head, body]);
}

// Splits a stream buffer into packets; returns {packets: [{type, body}], rest}.
export function decodePackets(buf) {
  const packets = [];
  while (buf.length >= 12) {
    const len = buf.readUInt32BE(6);
    if (len < 12 || buf.length < len) break;
    packets.push({type: buf.toString("latin1", 0, 4), body: buf.subarray(12, len)});
    buf = buf.subarray(len);
  }
  return {packets, rest: buf};
}
// Never queue or join real games (matchmaking, Premier, FACEIT, community servers) from automation.
const ONLINE = /^\s*(connect|retry|redirect|password|mm_|matchmaking|party|lobby|queue|playcast|gameui_activate|sv_lan\s+0)/i;
export const isOnlineCommand = command => String(command).split(";").some(c => ONLINE.test(c));
export const printText =body => body.subarray(PRNT_TEXT).toString("utf8").replace(/\0[\s\S]*$/, "").trimEnd();

export class VConsole {
  constructor() { this.buffer = Buffer.alloc(0); this.waiters = []; this.log = []; }
  async connect(port = 29000, {host = "127.0.0.1", timeoutMs = 180000, retryMs = 1000} = {}) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      try { await this.open(host, port); return this; }
      catch (e) { if (Date.now() > until) throw new Error(`CS2 VConsole did not open on port ${port}: ${e.message}`); await sleep(retryMs); }
    }
  }
  open(host, port) {
    return new Promise((resolve, reject) => {
      const s = net.connect({host, port});
      s.once("error", reject);
      s.once("connect", () => { s.off("error", reject); s.on("error", () => {}); this.socket = s; resolve(); });
      s.on("data", d => {
        const {packets, rest} = decodePackets(Buffer.concat([this.buffer, d])); this.buffer = rest;
        for (const p of packets) if (p.type === "PRNT") for (const line of printText(p.body).split(/\r?\n/)) {
          this.log.push(line);
          for (const w of [...this.waiters]) if (w.re.test(line)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(line); }
        }
        if (this.log.length > 5000) this.log.splice(0, 1000);
      });
    });
  }
  send(command) {
    if (!this.socket) throw new Error("Console not connected");
    if (isOnlineCommand(command)) throw new Error(`Refusing online command "${command}": the recorder only plays demos and local maps`);
    this.socket.write(encodeCommand(command));
  }
  waitFor(re, timeoutMs) {
    return new Promise(resolve => {
      const w = {re, resolve}; this.waiters.push(w);
      setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); resolve(null); } }, timeoutMs);
    });
  }
  close() { this.socket?.end(); this.socket = null; }
}
