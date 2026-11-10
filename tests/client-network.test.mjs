import test from "node:test";
import assert from "node:assert/strict";
import { clientNetwork } from "../lib/client-network.ts";

test("IPv4 addresses are their own network", () => {
  assert.equal(clientNetwork("203.0.113.7"), "203.0.113.7");
  assert.equal(clientNetwork("local"), "local");
});
test("IPv6 addresses collapse to their /64", () => {
  const net = "2001:db8:a:b::/64";
  assert.equal(clientNetwork("2001:db8:a:b::1"), net);
  assert.equal(clientNetwork("2001:0db8:000a:000b:ffff:1:2:3"), net);
  assert.equal(clientNetwork("2001:DB8:A:B:0:0:0:9"), net);
  assert.notEqual(clientNetwork("2001:db8:a:c::1"), net);
});
test("compressed zeros at either end expand correctly", () => {
  assert.equal(clientNetwork("::1"), "0:0:0:0::/64");
  assert.equal(clientNetwork("2001:db8::"), "2001:db8:0:0::/64");
  assert.equal(clientNetwork("fe80::1:2:3:4"), "fe80:0:0:0::/64");
});
