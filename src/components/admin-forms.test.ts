import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminActionFeedback } from "./admin-action-feedback";

const adminForms = readFileSync(new URL("./admin-forms.tsx", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../app/(desktop)/admin/page.tsx", import.meta.url), "utf8");

test("AdminActionFeedback renders success, info, and error regions", () => {
  const success = renderToStaticMarkup(
    createElement(AdminActionFeedback, {
      state: { status: "success", message: "Event added.", resetKey: 1 },
    }),
  );
  const info = renderToStaticMarkup(
    createElement(AdminActionFeedback, {
      state: { status: "info", message: "Request was already approved.", resetKey: 0 },
    }),
  );
  const error = renderToStaticMarkup(
    createElement(AdminActionFeedback, {
      state: { status: "error", message: "Delete failed.", resetKey: 0 },
    }),
  );

  assert.match(success, /role="status"/);
  assert.match(info, /role="status"/);
  assert.match(error, /role="alert"/);
  assert.match(success, /Event added\./);
});

test("AdminActionFeedback renders nothing while idle", () => {
  const markup = renderToStaticMarkup(
    createElement(AdminActionFeedback, {
      state: { status: "idle", message: null, resetKey: 0 },
    }),
  );

  assert.equal(markup, "");
});

test("admin client forms wire useActionState and pending labels", () => {
  assert.match(adminForms, /useActionState/);
  assert.match(adminForms, /Importing\.\.\./);
  assert.match(adminForms, /Adding event\.\.\./);
  assert.match(adminForms, /AdminActionFeedback/);
});

test("desktop admin page uses typed client forms and stays desktop-only", () => {
  assert.match(adminPage, /AdminJcncImportForm/);
  assert.match(adminPage, /AdminEventRequestCard/);
  assert.match(adminPage, /AdminCreateEventForm/);
  assert.match(adminPage, /AdminCreatePlaceForm/);
  assert.doesNotMatch(adminPage, /\/m\/admin/);
});
