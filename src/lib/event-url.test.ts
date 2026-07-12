import test from "node:test";
import assert from "node:assert/strict";
import { parseEventSourceUrl } from "./event-url";

test("parseEventSourceUrl accepts http and https URLs", () => {
  assert.equal(
    parseEventSourceUrl("https://jcnc.org/events/paryushan"),
    "https://jcnc.org/events/paryushan",
  );
  assert.equal(
    parseEventSourceUrl("HTTP://Example.COM:80/path"),
    "http://example.com/path",
  );
});

test("parseEventSourceUrl rejects malicious or malformed URLs", () => {
  for (const value of [
    "",
    "   ",
    "javascript:alert(1)",
    "data:text/html,hi",
    "vbscript:msgbox(1)",
    "//evil.com/phish",
    "not-a-url",
    "ftp://files.example.com/x",
    `https://example.com/${"a".repeat(2048)}`,
  ]) {
    assert.equal(parseEventSourceUrl(value), null, `expected null for ${JSON.stringify(value)}`);
  }
});
