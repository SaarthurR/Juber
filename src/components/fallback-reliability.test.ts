import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Google OAuth setup and request share one retryable catch boundary", () => {
  const authButton = source("./auth-button.tsx");
  const signIn = authButton.slice(
    authButton.indexOf("async function signIn"),
    authButton.indexOf("return ("),
  );

  assert.match(signIn, /setLoading\(true\);\s*try \{/);
  assert.match(
    signIn,
    /try \{[\s\S]*createClient\(\)[\s\S]*window\.location[\s\S]*signInWithOAuth/,
  );
  assert.match(signIn, /if \(signInError\) throw signInError/);
  assert.match(
    signIn,
    /catch \{[\s\S]*setError\(GOOGLE_SIGN_IN_ERROR\)[\s\S]*setLoading\(false\)/,
  );
  assert.match(authButton, /setError\(null\)[\s\S]*setLoading\(true\)/);
  assert.match(authButton, /role="alert"/);
  assert.doesNotMatch(authButton, /getGoogleSignInError|finally/);
});

test("mobile requests always use required free text with optional suggestions", () => {
  const requestForm = source("./mobile/request-form.tsx");
  assert.match(requestForm, /name="neighborhood"[\s\S]*list="places"[\s\S]*required/);
  assert.match(requestForm, /<PlacesDatalist places=\{options\} \/>/);
  assert.doesNotMatch(requestForm, /<select name="neighborhood"/);
});

test("desktop and mobile avatars remember only the failed source", () => {
  for (const path of ["./ui/avatar.tsx", "./mobile/m-avatar.tsx"]) {
    const avatar = source(path);
    assert.match(avatar, /const \[failedSrc, setFailedSrc\] = useState<string \| null>\(null\)/);
    assert.match(avatar, /src && failedSrc !== src/);
    assert.match(avatar, /onError=\{\(\) => setFailedSrc\(src\)\}/);
    assert.match(avatar, /role="img"/);
    assert.match(avatar, /aria-label=\{name \?\? "Avatar"\}/);
  }
});
