import assert from "node:assert/strict";
import test from "node:test";
import { throwReadError } from "./read-error";

test("throwReadError distinguishes successful empty reads from failures", () => {
  assert.doesNotThrow(() => throwReadError(null, "rides"));
  assert.throws(
    () => throwReadError({ code: "42501" }, "rides"),
    /^Error: Could not load rides\.$/,
  );
});
