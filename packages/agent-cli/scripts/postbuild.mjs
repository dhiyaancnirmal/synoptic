/* global console */
import { readFileSync, writeFileSync, chmodSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "..", "dist", "index.js");

let content = readFileSync(distPath, "utf-8");

if (!content.startsWith("#!/usr/bin/env node")) {
  content = "#!/usr/bin/env node\n" + content;
  writeFileSync(distPath, content);
}

chmodSync(distPath, 0o755);
console.log("Added shebang and made executable");
