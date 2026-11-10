/**
 * Deploy the existing Nitro Cloudflare build ONLY to the isolated WAY.APP preview.
 * Run after `npm run build`. Never deploys to the production Worker.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const config = ".output/server/wrangler.json";
const target = "wayup-integrada-preview";

if (!existsSync(config)) {
  console.error("Missing Nitro Cloudflare output. Run npm run build first.");
  process.exit(1);
}

const generated = JSON.parse(readFileSync(config, "utf8"));
if (!generated.main && !generated.assets) {
  console.error("Unexpected Nitro Wrangler config: missing main/assets. Refusing to deploy.");
  process.exit(1);
}

console.log(`Deploying Nitro output exclusively to ${target}`);
const result = spawnSync(
  "npx",
  ["--yes", "wrangler", "deploy", "--config", config, "--name", target],
  { stdio: "inherit", shell: process.platform === "win32" },
);
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
