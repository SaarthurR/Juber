import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import DesktopError from "@/app/(desktop)/error";
import MobileError from "@/app/m/error";

test("recovery boundaries announce failures and activate retry", () => {
  for (const Boundary of [DesktopError, MobileError]) {
    let retries = 0;
    const element = Boundary({ unstable_retry: () => retries++ });
    const button = Array.isArray(element.props.children)
      ? element.props.children.find(
          (child: { type?: string }) => child?.type === "button",
        )
      : null;

    assert.match(renderToStaticMarkup(element), /role="alert"/);
    assert.equal(typeof button?.props.onClick, "function");
    button.props.onClick();
    assert.equal(retries, 1);
  }
});
