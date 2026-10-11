// usage: npm run new:module -- <id> "<Title>" <category>   e.g. npm run new:module -- watermark "Add watermark" edit
import { cpSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [id, title = id, category = "edit"] = process.argv.slice(2);
if (!id) { console.error("module id required"); process.exit(1); }
const dir = `packages/mod-${id}`; mkdirSync(dir, { recursive: true });
cpSync("packages/mod-rotate", dir, { recursive: true });
for (const f of ["package.json", "src/manifest.ts", "src/index.ts"]) {
  const p = `${dir}/${f}`; writeFileSync(p, readFileSync(p, "utf8").replaceAll("rotate", id));
}
let m = readFileSync(`${dir}/src/manifest.ts`, "utf8")
  .replace(/title: "[^"]*"/, `title: "${title}"`).replace(/category: "[^"]*"/, `category: "${category}"`);
writeFileSync(`${dir}/src/manifest.ts`, m);
console.log(`Created ${dir}. Now add 2 lines to apps/web/lib/registry.ts, the dependency to apps/web/package.json, and the name to transpilePackages.`);
