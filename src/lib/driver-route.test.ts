import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  driverRouteEmbedUrl,
  driverRouteLeg,
  requireGoogleAddressSelection,
  riderEndpointLabel,
} from "@/lib/driver-route";

test("driver first-mile route runs from home to a to-JCNC rider", () => {
  assert.deepEqual(
    driverRouteLeg({
      originLabel: "Fremont",
      destinationLabel: "JCNC",
      driverHome: "1 Driver Way",
      riderEndpoint: "2 Rider Road",
    }),
    {
      origin: "1 Driver Way",
      destination: "2 Rider Road",
      endpointLabel: "Pickup",
    },
  );
});

test("driver last-mile route runs from a from-JCNC rider to home", () => {
  assert.deepEqual(
    driverRouteLeg({
      originLabel: "JCNC",
      destinationLabel: "Fremont",
      driverHome: "1 Driver Way",
      riderEndpoint: "2 Rider Road",
    }),
    {
      origin: "2 Rider Road",
      destination: "1 Driver Way",
      endpointLabel: "Drop-off",
    },
  );
});

test("ambiguous directions and missing route inputs stay unavailable", () => {
  assert.equal(riderEndpointLabel("JCNC", "JCNC"), null);
  assert.equal(riderEndpointLabel("Fremont", "San Jose"), null);
  assert.equal(
    driverRouteEmbedUrl({
      apiKey: "",
      originLabel: "Fremont",
      destinationLabel: "JCNC",
      driverHome: "1 Driver Way",
      riderEndpoint: "2 Rider Road",
    }),
    null,
  );
});

test("embed URL uses encoded direction parameters", () => {
  const url = new URL(
    driverRouteEmbedUrl({
      apiKey: "public-key",
      originLabel: "JCNC",
      destinationLabel: "Fremont",
      driverHome: "1 Driver Way, San Jose",
      riderEndpoint: "2 Rider Road & Main",
    })!,
  );
  assert.equal(url.searchParams.get("origin"), "2 Rider Road & Main");
  assert.equal(url.searchParams.get("destination"), "1 Driver Way, San Jose");
  assert.equal(url.searchParams.get("mode"), "driving");
  assert.equal(url.searchParams.get("units"), "imperial");
});

test("new Google-powered addresses require a selected street place", () => {
  assert.doesNotThrow(() =>
    requireGoogleAddressSelection({
      address: "123 Main St",
      placeId: "ChIJ1234567890",
      placeType: "street_address",
      enabled: true,
      label: "your home",
    }),
  );
  assert.throws(
    () =>
      requireGoogleAddressSelection({
        address: "Fremont, CA",
        placeId: "ChIJ1234567890",
        placeType: "locality",
        enabled: true,
        label: "your home",
      }),
    /Choose a street address/,
  );
});

test("unchanged legacy and keyless manual addresses remain valid", () => {
  assert.doesNotThrow(() =>
    requireGoogleAddressSelection({
      address: "Legacy home",
      placeId: null,
      placeType: null,
      previousAddress: "Legacy home",
      enabled: true,
      label: "your home",
    }),
  );
  assert.doesNotThrow(() =>
    requireGoogleAddressSelection({
      address: "Manual home",
      placeId: null,
      placeType: null,
      enabled: false,
      label: "your home",
    }),
  );
});

test("pending rider review stays responsive, lazy, and decision-safe", () => {
  const source = readFileSync("src/components/rider-decision-dialog.tsx", "utf8");
  assert.match(source, /New rider/);
  assert.match(source, /Party of \{partyTotal\(guestCount\)\}/);
  assert.match(source, /<DesktopDialog/);
  assert.match(source, /<BottomSheet/);
  assert.match(source, /loading="lazy"/);
  assert.match(source, /Route preview unavailable/);
  assert.match(source, /<PassengerStatusButtons/);
  assert.ok(source.indexOf("{embedUrl ?") < source.indexOf("<iframe"));
});

test("place input submits selections through a hidden field and clears stale values", () => {
  const source = readFileSync("src/components/google-place-input.tsx", "utf8");
  assert.match(source, /PlaceAutocompleteElement/);
  assert.match(source, /addEventListener\("gmp-select"/);
  assert.match(source, /fetchFields\(\{ fields: \["formattedAddress", "id", "types"\] \}\)/);
  assert.match(source, /placeIdRef\.current\.value = ""/);
  assert.match(source, /type="hidden" name=\{name\}/);
  assert.match(source, /name=\{`\$\{name\}_place_id`\}/);
  assert.match(source, /includedPrimaryTypes = \[\.\.\.GOOGLE_ADDRESS_TYPES\]/);
  assert.match(source, /autocompleteRef\.current\?\.focus\(\)/);
  assert.match(source, /We couldn't verify that address/);
  assert.match(source, /manualFallback/);
});
