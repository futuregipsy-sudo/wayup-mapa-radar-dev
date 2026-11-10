import { readFileSync, writeFileSync, existsSync } from "node:fs";

// Nitro generates this file on every build. Keep the preview setting in source control
// by applying it after generation rather than editing .output by hand.
const path = ".output/server/wrangler.json";
if (!existsSync(path)) {
  console.error(`Expected generated Wrangler configuration at ${path}`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(path, "utf8"));
config.previews ??= {};
writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
console.log("Worker Previews configuration added to generated Wrangler file.");
