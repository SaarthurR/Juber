import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RidesTabList, RidesTabPanels } from "./rides-tabs";

function openingTag(markup: string, id: string) {
  return markup.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0] ?? "";
}

function renderTabs(activeTab: "carpools" | "requests") {
  return renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(RidesTabList, {
        activeTab,
        requestCount: 3,
        onSelect: () => undefined,
      }),
      createElement(RidesTabPanels, {
        activeTab,
        carpools: createElement("p", null, "Carpool panel"),
        requests: createElement("p", null, "Request panel"),
      }),
    ),
  );
}

test("rides tabs render stable ids, roving tabindex, and complete ARIA relationships", () => {
  const markup = renderTabs("carpools");
  const carpoolsTab = openingTag(markup, "rides-carpools-tab");
  const requestsTab = openingTag(markup, "rides-requests-tab");
  const carpoolsPanel = openingTag(markup, "rides-carpools-panel");
  const requestsPanel = openingTag(markup, "rides-requests-panel");

  assert.match(markup, /role="tablist"/);
  assert.equal((markup.match(/role="tab"/g) ?? []).length, 2);
  assert.equal((markup.match(/role="tabpanel"/g) ?? []).length, 2);

  assert.match(carpoolsTab, /aria-selected="true"/);
  assert.match(carpoolsTab, /aria-controls="rides-carpools-panel"/);
  assert.match(carpoolsTab, /tabindex="0"/);
  assert.match(requestsTab, /aria-selected="false"/);
  assert.match(requestsTab, /aria-controls="rides-requests-panel"/);
  assert.match(requestsTab, /tabindex="-1"/);

  assert.match(carpoolsPanel, /aria-labelledby="rides-carpools-tab"/);
  assert.doesNotMatch(carpoolsPanel, / hidden/);
  assert.match(requestsPanel, /aria-labelledby="rides-requests-tab"/);
  assert.match(requestsPanel, / hidden/);
  assert.match(markup, /Carpool panel/);
  assert.match(markup, /Request panel/);
});

test("selecting requests flips roving focus and panel visibility without removing either panel", () => {
  const markup = renderTabs("requests");
  const carpoolsTab = openingTag(markup, "rides-carpools-tab");
  const requestsTab = openingTag(markup, "rides-requests-tab");
  const carpoolsPanel = openingTag(markup, "rides-carpools-panel");
  const requestsPanel = openingTag(markup, "rides-requests-panel");

  assert.match(carpoolsTab, /aria-selected="false"/);
  assert.match(carpoolsTab, /tabindex="-1"/);
  assert.match(requestsTab, /aria-selected="true"/);
  assert.match(requestsTab, /tabindex="0"/);
  assert.match(carpoolsPanel, / hidden/);
  assert.doesNotMatch(requestsPanel, / hidden/);
  assert.equal((markup.match(/role="tabpanel"/g) ?? []).length, 2);
});
