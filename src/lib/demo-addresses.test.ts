import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoPlaceInput } from "@/components/demo-place-input";
import { DemoRoutePreview } from "@/components/demo-route-preview";
import {
  DEMO_ADDRESS_PATTERN,
  DEMO_ADDRESSES,
  demoAddressSelection,
  demoAddressSuggestions,
  demoRoute,
  isDemoAddressSelectionValid,
} from "@/lib/demo-addresses";
import { requireGoogleAddressSelection } from "@/lib/driver-route";

test("demo address suggestions and selection are deterministic", () => {
  assert.deepEqual(
    demoAddressSuggestions("milpitas").map((address) => address.id),
    ["demo-place-jcnc", "demo-place-milpitas"],
  );
  assert.deepEqual(demoAddressSelection(" 722 s MAIN st, MILPITAS, ca 95035 "), {
    address: "722 S Main St, Milpitas, CA 95035",
    placeId: "demo-place-jcnc",
    placeType: "street_address",
  });
  assert.equal(demoAddressSelection("123 Unlisted St"), null);
});

test("every demo selection satisfies the existing address validator", () => {
  for (const address of DEMO_ADDRESSES) {
    const selection = demoAddressSelection(address.formattedAddress)!;
    assert.doesNotThrow(() =>
      requireGoogleAddressSelection({
        address: selection.address,
        placeId: selection.placeId,
        placeType: selection.placeType,
        enabled: true,
        label: "demo address",
      }),
    );
  }
});

test("form submission contract rejects typed addresses outside the fixture list", () => {
  const browserPattern = new RegExp(`^(?:${DEMO_ADDRESS_PATTERN})$`);
  assert.equal(isDemoAddressSelectionValid("123 Unlisted St", true), false);
  assert.equal(browserPattern.test("123 Unlisted St"), false);
  assert.equal(isDemoAddressSelectionValid(DEMO_ADDRESSES[1].formattedAddress, true), true);
  assert.equal(browserPattern.test(DEMO_ADDRESSES[1].formattedAddress), true);
  assert.equal(isDemoAddressSelectionValid("", true), false);
  assert.equal(isDemoAddressSelectionValid("", false), true);
});

test("demo route keeps fixed mileage, duration, and direction", () => {
  const route = demoRoute("demo-place-fremont", "demo-place-jcnc");
  assert.equal(route?.distanceMiles, 11.8);
  assert.equal(route?.durationMinutes, 18);
  assert.equal(route?.origin.id, "demo-place-fremont");
  assert.equal(route?.destination.id, "demo-place-jcnc");
  assert.equal(demoRoute("Unknown address", DEMO_ADDRESSES[0].formattedAddress), null);
  const riderLeg = demoRoute(
    "3251 20th Ave, San Francisco, CA",
    "1820 Shattuck Ave, Berkeley, CA",
  );
  assert.equal(riderLeg?.distanceMiles, 18.4);
  assert.equal(riderLeg?.durationMinutes, 29);
  assert.equal(riderLeg?.origin.label, "Driver home");
  assert.equal(riderLeg?.destination.label, "Rider address");
});

test("demo place input submits Google-compatible selection fields", () => {
  const markup = renderToStaticMarkup(
    createElement(DemoPlaceInput, {
      name: "home_address",
      initialValue: DEMO_ADDRESSES[0].formattedAddress,
      placeholder: "Search address",
      label: "Home address",
      className: "field",
    }),
  );
  assert.match(markup, /name="home_address"/);
  assert.match(markup, /name="home_address_place_id" value="demo-place-jcnc"/);
  assert.match(markup, /name="home_address_place_type" value="street_address"/);
  assert.match(markup, /<datalist/);
  assert.match(markup, /autoComplete="off"/);
  assert.match(markup, /pattern="[^"]+"/);
});

test("demo route preview renders local artwork and explicit route details", () => {
  const markup = renderToStaticMarkup(
    createElement(DemoRoutePreview, {
      origin: "demo-place-fremont",
      destination: "demo-place-jcnc",
    }),
  );
  assert.match(markup, /<svg/);
  assert.doesNotMatch(markup, /iframe|https?:\/\//);
  assert.match(markup, /11\.8 miles/);
  assert.match(markup, /About 18 min/);
  assert.match(markup, /Origin/);
  assert.match(markup, /Destination/);
});
