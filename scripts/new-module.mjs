// usage: npm run new:module -- <id> "<Title>" <category>   e.g. npm run new:module -- watermark "Add Watermark" edit
import { writeFileSync, mkdirSync } from "node:fs";

const [id, rawTitle, category = "edit"] = process.argv.slice(2);
if (!id) {
  console.error("Usage: npm run new:module -- <id> \"<Title>\" <category>");
  console.error("Example: npm run new:module -- watermark \"Add Watermark\" edit");
  process.exit(1);
}

const title = rawTitle || id.charAt(0).toUpperCase() + id.slice(1);
const pascalCase = id
  .split("-")
  .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
  .join("");

const dir = `packages/mod-${id}`;
mkdirSync(`${dir}/src`, { recursive: true });

// 1. package.json
const pkgJson = {
  name: `@pdfkit/mod-${id}`,
  version: "0.1.0",
  private: true,
  type: "module",
  exports: {
    ".": "./src/index.ts",
    "./manifest": "./src/manifest.ts",
  },
  scripts: {
    typecheck: "tsc --noEmit",
    test: "node --experimental-strip-types ../../scripts/test-modules.mjs",
  },
  dependencies: {
    "@pdfkit/core": "*",
    "@cantoo/pdf-lib": "^2.3.0",
  },
};
writeFileSync(`${dir}/package.json`, JSON.stringify(pkgJson, null, 2) + "\n");

// 2. tsconfig.json
const tsConfig = {
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
  },
  include: ["src/**/*"],
};
writeFileSync(`${dir}/tsconfig.json`, JSON.stringify(tsConfig, null, 2) + "\n");

// 3. src/manifest.ts
const manifestContent = `import type { ToolManifest } from "@pdfkit/core";

export const manifest: ToolManifest = {
  id: "${id}",
  title: "${title}",
  description: "${title} for PDF documents",
  category: "${category}" as any,
  backend: "client",
  accepts: ["application/pdf"],
  multiple: false,
  fields: [],
  related: ["merge", "split"],
};
`;
writeFileSync(`${dir}/src/manifest.ts`, manifestContent);

// 4. src/index.ts
const indexContent = `import type { ToolModule, InputFile, OutputFile, RunContext } from "@pdfkit/core";
import { ToolError, checkAborted } from "@pdfkit/core";
import { PDFDocument } from "@cantoo/pdf-lib";

export interface ${pascalCase}Options {}

const tool: ToolModule<${pascalCase}Options> = {
  async run(
    inputs: InputFile[],
    opts: ${pascalCase}Options = {},
    ctx?: RunContext
  ): Promise<OutputFile[]> {
    if (!inputs.length) {
      throw new ToolError("At least one input file is required.");
    }
    checkAborted(ctx?.signal);
    ctx?.onProgress?.(0.1);

    const input = inputs[0];
    const doc = await PDFDocument.load(input.data, { ignoreEncryption: true });
    checkAborted(ctx?.signal);
    ctx?.onProgress?.(0.5);

    // TODO: Implement ${title} logic on doc here

    checkAborted(ctx?.signal);
    const data = await doc.save();
    ctx?.onProgress?.(1.0);

    const baseName = input.name.replace(/\\.pdf$/i, "");
    return [
      {
        name: \`\${baseName}_${id}.pdf\`,
        mime: "application/pdf",
        data,
      },
    ];
  },
};

export default tool;
`;
writeFileSync(`${dir}/src/index.ts`, indexContent);

console.log(`
Created ${dir} minimal template.

Contributor Checklist:
1. Web Registry Wiring:
   - apps/web/package.json: add "@pdfkit/mod-${id}": "*" to dependencies
   - apps/web/next.config.mjs: add "@pdfkit/mod-${id}" to transpilePackages
   - apps/web/lib/registry.ts: import manifest and add to loaders Record
2. Navigation:
   - Header navigation links automatically derive from registry.ts
3. Tool Interface:
   - Renders generic ToolRunner fallback by default
   - Or register a custom component in apps/web/lib/toolComponents.tsx
4. Testing:
   - Add unit tests in scripts/test-modules.mjs
   - Verify with: npm run typecheck && npm test
5. Documentation:
   - Add module to README.md and docs/MODULES.md
`);
