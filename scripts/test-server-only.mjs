import { registerHooks } from "node:module";

const stub = new URL("./test-server-only-stub.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? { url: stub, shortCircuit: true }
      : nextResolve(specifier, context);
  },
});
