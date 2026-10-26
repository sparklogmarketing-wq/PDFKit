import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Tooling, TypeScript and CI Infrastructure (Issue #28)", async (t) => {
  await t.test("root package.json enforces Node >=22.6.0 and workspace scripts", () => {
    const rootPkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    assert.ok(rootPkg.engines?.node, "Missing engines.node in root package.json");
    assert.strictEqual(rootPkg.engines.node.includes("22.6"), true, "engines.node must enforce >=22.6.0");
    assert.ok(rootPkg.scripts?.typecheck, "Missing typecheck script in root package.json");
    assert.ok(rootPkg.scripts?.lint, "Missing lint script in root package.json");
    assert.ok(rootPkg.scripts?.test, "Missing test script in root package.json");
  });

  await t.test("every workspace package has tsconfig.json and typecheck script", () => {
    const packagesDir = "packages";
    const packages = fs.readdirSync(packagesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    assert.ok(packages.length >= 7, "Expected at least 7 packages in packages/");

    for (const pkg of packages) {
      const pkgJsonPath = path.join(packagesDir, pkg, "package.json");
      assert.strictEqual(fs.existsSync(pkgJsonPath), true, `Package ${pkg} missing package.json`);

      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
      assert.strictEqual(typeof pkgJson.scripts?.typecheck, "string", `Package ${pkg} missing scripts.typecheck`);

      const tsconfigPath = path.join(packagesDir, pkg, "tsconfig.json");
      assert.strictEqual(fs.existsSync(tsconfigPath), true, `Package ${pkg} missing tsconfig.json`);
    }

    const webPkgJson = JSON.parse(fs.readFileSync("apps/web/package.json", "utf8"));
    assert.strictEqual(typeof webPkgJson.scripts?.typecheck, "string", "apps/web missing scripts.typecheck");
    assert.strictEqual(typeof webPkgJson.scripts?.lint, "string", "apps/web missing scripts.lint");
    assert.strictEqual(fs.existsSync("apps/web/tsconfig.json"), true, "apps/web missing tsconfig.json");
  });

  await t.test("CI workflow exists and tests on Linux and Windows", () => {
    const ciPath = ".github/workflows/ci.yml";
    assert.strictEqual(fs.existsSync(ciPath), true, "CI workflow .github/workflows/ci.yml must exist");

    const ciContent = fs.readFileSync(ciPath, "utf8");
    assert.ok(ciContent.includes("ubuntu-latest"), "CI must include ubuntu-latest");
    assert.ok(ciContent.includes("windows-latest"), "CI must include windows-latest");
    assert.ok(ciContent.includes("npm run typecheck"), "CI must run typecheck");
    assert.ok(ciContent.includes("npm run lint"), "CI must run lint");
    assert.ok(ciContent.includes("npm test"), "CI must run tests");
    assert.ok(ciContent.includes("npm run build"), "CI must run build");
  });

  await t.test("ESLint configuration exists", () => {
    assert.strictEqual(fs.existsSync("apps/web/.eslintrc.json"), true, "apps/web/.eslintrc.json must exist");
  });
});
