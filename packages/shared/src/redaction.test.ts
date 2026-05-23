import assert from "node:assert/strict";
import test from "node:test";
import { preview, redactPii } from "./index.js";

test("redacts common PII and credentials from previews", () => {
  const input = "Email ada@example.com, phone 415-555-1212, key gsk_abc123456789secret, Bearer abc.def.ghi";
  const redacted = redactPii(input);

  assert.equal(redacted.includes("ada@example.com"), false);
  assert.equal(redacted.includes("415-555-1212"), false);
  assert.equal(redacted.includes("gsk_abc123456789secret"), false);
  assert.equal(redacted.includes("abc.def.ghi"), false);
});

test("normalizes whitespace and bounds preview length", () => {
  const output = preview("hello\n\nworld ".repeat(100), 40);

  assert.ok(output.length <= 43);
  assert.equal(output.includes("\n"), false);
});
