import test from "node:test";
import assert from "node:assert/strict";
import {encodeCommand, decodePackets, printText, isOnlineCommand} from "../recorder/vconsole.mjs";

test("online and matchmaking commands are refused", () => {
  for (const c of ["connect 1.2.3.4", "volume 1; connect x", "mm_queue", "retry", "playcast http://x"]) assert.ok(isOnlineCommand(c), c);
  for (const c of ["map de_mirage", "playdemo x", "demo_gototick 5", "spec_mode 1", "disconnect", "bot_quota 10"]) assert.ok(!isOnlineCommand(c), c);
});

const packet = (type, body, version = 0xd4) => {
  const head = Buffer.alloc(12); head.write(type, 0, "latin1"); head.writeUInt16BE(version, 4); head.writeUInt32BE(12 + body.length, 6);
  return Buffer.concat([head, body]);
};

test("CMND packets carry version, 32-bit length and a NUL-terminated command", () => {
  const b = encodeCommand("demo_pause");
  assert.equal(b.toString("latin1", 0, 4), "CMND");
  assert.equal(b.readUInt16BE(4), 0xd4);
  assert.equal(b.readUInt32BE(6), b.length);
  assert.equal(b.subarray(12).toString(), "demo_pause\0");
});

test("decoder handles large and split packets and extracts PRNT text", () => {
  const prnt = packet("PRNT", Buffer.concat([Buffer.alloc(28, 1), Buffer.from("Demo playback finished\n\0junk")]));
  const big = packet("CVRB", Buffer.alloc(70000), 2);
  const stream = Buffer.concat([big, prnt]);
  const first = decodePackets(stream.subarray(0, 70005));
  assert.equal(first.packets.length, 0);
  const {packets, rest} = decodePackets(stream);
  assert.deepEqual(packets.map(p => p.type), ["CVRB", "PRNT"]);
  assert.equal(rest.length, 0);
  assert.equal(printText(packets[1].body), "Demo playback finished");
});
