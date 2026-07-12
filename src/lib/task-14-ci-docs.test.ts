import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as ContactSheetModule from "@/components/mobile/contact-sheet";

const repoRoot = process.cwd();

function readRepo(path: string) {
  return readFileSync(`${repoRoot}/${path}`, "utf8");
}

const contactSheetExports = ContactSheetModule as unknown as {
  ContactSheetContent?: React.ComponentType<{
    driverId: string;
    driverFullName: string | null;
    rideId: string;
    phone: string | null;
    whatsapp: string | null;
    preferredContact: "phone" | "whatsapp" | "message" | null;
    defaultOpen?: boolean;
  }>;
};

test("npm test discovers nested src tests without shell globstar", () => {
  const pkg = JSON.parse(readRepo("package.json"));
  assert.match(pkg.scripts.test, /scripts\/run-tests\.mjs/);
  assert.doesNotMatch(pkg.scripts.test, /\*\*/);

  const listed = execFileSync("node", ["scripts/run-tests.mjs", "--list"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  assert.equal(listed.length, 49);
  assert.ok(listed.includes("src/components/mobile/back-button.test.ts"));
  assert.ok(listed.includes("src/lib/supabase/read-error.test.ts"));
});

test("ci workflow runs every push and pull request through the required Node 24 gates", () => {
  const workflow = readRepo(".github/workflows/ci.yml");
  const triggers = workflow.match(/^on:\n([\s\S]*?)^concurrency:/m)?.[1] ?? "";

  assert.match(triggers, /^  push:\s*$/m);
  assert.match(triggers, /^  pull_request:\s*$/m);
  assert.doesNotMatch(triggers, /^\s+branches:/m);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npx tsc --noEmit/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /cancel-in-progress:\s*true/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
});

test("env example documents required and optional variables without real secrets", () => {
  const example = readRepo(".env.local.example");

  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_NUMBER",
  ]) {
    assert.match(example, new RegExp(`^${key}=`, "m"));
  }

  assert.doesNotMatch(example, /supabase\.co\/auth\/v1\/(?!callback)/);
  assert.doesNotMatch(example, /eyJ[A-Za-z0-9_-]{20,}/);
  assert.match(example, /Never commit real secrets/i);
  assert.match(example, /Server-only/i);
  assert.match(example, /best-effort/i);
});

test("readme documents migrations oauth demo policy and known limitations", () => {
  const readme = readRepo("README.md");

  assert.match(readme, /0001.*0032|0001` through `0032/);
  assert.match(readme, /supabase db push/);
  assert.match(readme, /supabase migration list/);
  assert.match(readme, /auth\/callback/);
  assert.match(readme, /profile_contacts|contact-filled/i);
  assert.match(readme, /two Google accounts|two-role/i);
  assert.match(readme, /JCNC import/i);
  assert.match(readme, /24 hours after/i);
  assert.match(readme, /In-app chat/i);
  assert.match(readme, /Twilio/i);
  assert.match(readme, /\/m/);
  assert.match(readme, /paid Supabase preview|Browser\/Realtime E2E/i);
  assert.doesNotMatch(readme, /run `supabase\/migrations\/0001_init\.sql`/);
});

test("rides board empty states use warmer icon-led JCNC copy", () => {
  const ridesView = readRepo("src/components/rides-view.tsx");
  const homeBoard = readRepo("src/components/mobile/home-board.tsx");

  assert.match(ridesView, /Car/);
  assert.match(ridesView, /MessagesSquare/);
  assert.match(ridesView, /Be the first to offer a ride to JCNC/);
  assert.match(ridesView, /When someone needs a ride to JCNC/);

  assert.match(homeBoard, /Car/);
  assert.match(homeBoard, /MessagesSquare/);
  assert.match(homeBoard, /No carpools yet/);
  assert.match(homeBoard, /No requests yet/);
});

test("post-booking guidance tells confirmed riders to use in-app chat", () => {
  const desktopRide = readRepo("src/app/(desktop)/rides/[id]/page.tsx");
  const mobileRide = readRepo("src/app/m/rides/[id]/page.tsx");

  assert.match(desktopRide, /Use in-app chat to confirm pickup details/);
  assert.match(mobileRide, /Use in-app chat to confirm pickup details/);
  assert.match(desktopRide, /myJoin\.status === "confirmed"/);
  assert.match(mobileRide, /myJoin\.status === "confirmed"/);
});

test("contact surfaces note that in-app chat remains after raw contact expires", () => {
  const modal = readRepo("src/components/contact-modal.tsx");
  const sheet = readRepo("src/components/mobile/contact-sheet.tsx");

  assert.match(modal, /In-app chat stays available after phone and WhatsApp access expires/);
  assert.match(sheet, /In-app chat stays available after phone and WhatsApp access expires/);

  const ContactSheetContent = contactSheetExports.ContactSheetContent;
  assert.equal(typeof ContactSheetContent, "function");
  if (!ContactSheetContent) return;

  const html = renderToStaticMarkup(
    React.createElement(ContactSheetContent, {
      driverId: "driver-1",
      driverFullName: "Priya Shah",
      rideId: "ride-1",
      phone: "+15555550100",
      whatsapp: null,
      preferredContact: "phone",
      defaultOpen: true,
    }),
  );

  assert.match(html, /In-app chat stays available after phone and WhatsApp access expires/);
  assert.match(html, /Phone/);
});

test("gitignore tracks env example while ignoring real env files", () => {
  const gitignore = readRepo(".gitignore");

  assert.match(gitignore, /\.env\*/);
  assert.match(gitignore, /!\.env\.local\.example/);
});
