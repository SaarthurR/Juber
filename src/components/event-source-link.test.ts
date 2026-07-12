import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventSourceLink } from "./event-source-link";

test("EventSourceLink renders valid noncanonical http and https URLs safely", () => {
  for (const [raw, canonical] of [
    ["HTTP://Example.COM:80/event", "http://example.com/event"],
    ["HTTPS://Example.COM:443/event", "https://example.com/event"],
  ]) {
    const markup = renderToStaticMarkup(
      createElement(EventSourceLink, { href: raw }),
    );
    assert.match(markup, new RegExp(`href="${canonical}"`));
    assert.match(markup, /target="_blank"/);
    assert.match(markup, /rel="noopener noreferrer"/);
  }
});

test("EventSourceLink renders no target for unsafe URLs", () => {
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "vbscript:msgbox(1)",
    "//evil.example/phish",
    `https://example.com/${"a".repeat(2048)}`,
  ]) {
    assert.equal(
      renderToStaticMarkup(createElement(EventSourceLink, { href })),
      "",
    );
  }
});
