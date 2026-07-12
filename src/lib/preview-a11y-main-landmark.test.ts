import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomNavView } from "@/components/mobile/bottom-nav";

const appRoot = fileURLToPath(new URL("../app/", import.meta.url));
const componentsRoot = fileURLToPath(new URL("../components/", import.meta.url));

function appPath(path: string) {
  return join(appRoot, path);
}

function componentPath(path: string) {
  return join(componentsRoot, path);
}

function countMainOpenTags(source: string) {
  return (source.match(/<main[\s>]/g) ?? []).length;
}

function listTsxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listTsxFiles(full));
      continue;
    }
    if (entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

test("source: route-group layouts own exactly one main landmark each", () => {
  const rootLayout = readFileSync(appPath("layout.tsx"), "utf8");
  const desktopLayout = readFileSync(appPath("(desktop)/layout.tsx"), "utf8");
  const mobileLayout = readFileSync(appPath("m/layout.tsx"), "utf8");

  assert.equal(countMainOpenTags(rootLayout), 0);
  assert.equal(countMainOpenTags(desktopLayout), 1);
  assert.equal(countMainOpenTags(mobileLayout), 1);
  assert.match(desktopLayout, /<main className="flex-1">\{children\}<\/main>/);
  assert.match(mobileLayout, /<main>\{children\}<\/main>/);
  assert.doesNotMatch(mobileLayout, /<main[\s\S]*<main/);
  assert.match(mobileLayout, /LandingAuthGate/);
  assert.match(mobileLayout, /BottomNav/);
});

test("source: root auth and gate wrappers do not add duplicate mains", () => {
  const authError = readFileSync(appPath("auth/auth-error/page.tsx"), "utf8");
  const landingAuthGate = readFileSync(componentPath("landing-auth-gate.tsx"), "utf8");
  const contactGate = readFileSync(componentPath("contact-required-gate.tsx"), "utf8");

  assert.equal(countMainOpenTags(authError), 0);
  assert.equal(countMainOpenTags(landingAuthGate), 0);
  assert.equal(countMainOpenTags(contactGate), 1);
  assert.match(contactGate, /if \(!allowed\)[\s\S]*<main/);
  assert.match(contactGate, /return children;/);
  assert.equal(existsSync(appPath("auth/callback/route.ts")), true);
  assert.equal(existsSync(appPath("auth/signout/route.ts")), true);
});

test("source: mobile route pages do not nest their own main landmarks", () => {
  const mobilePages = listTsxFiles(appPath("m")).filter((file) => file.endsWith("page.tsx"));

  assert.ok(mobilePages.length > 0);
  for (const page of mobilePages) {
    const source = readFileSync(page, "utf8");
    assert.equal(
      countMainOpenTags(source),
      0,
      `${page.replace(appRoot, "")} should not declare its own <main>`,
    );
  }
});

test("rendered: desktop and mobile shells expose exactly one main", () => {
  const page = React.createElement("p", null, "Page content");

  const desktopHtml = renderToStaticMarkup(
    React.createElement(
      "div",
      { className: "desktop-shell contents" },
      React.createElement("header", { "aria-label": "Site" }),
      React.createElement("main", { className: "flex-1" }, page),
      React.createElement("footer", null, "Footer"),
    ),
  );

  const mobileHtml = renderToStaticMarkup(
    React.createElement(
      "div",
      { className: "mobile-shell relative mx-auto min-h-screen w-full max-w-[440px] bg-cream" },
      React.createElement("main", null, page),
      React.createElement(BottomNavView, { pathname: "/m" }),
    ),
  );

  assert.equal(countMainOpenTags(desktopHtml), 1);
  assert.equal(countMainOpenTags(mobileHtml), 1);
  assert.doesNotMatch(mobileHtml, /<main[\s\S]*<main/);
  assert.match(mobileHtml, /<nav[\s\S]*href="\/m"/);
});
