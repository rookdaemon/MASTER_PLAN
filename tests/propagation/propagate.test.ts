import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync, type ExecSyncOptionsWithStringEncoding } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// --- Constants from Threshold Registry ---
const MIN_PROPAGATION_ENDPOINTS = 3;
const MIN_GIT_REMOTES_WARNING = 2;
const MANIFEST_VERSION = "0.4";

// --- Test Helpers ---

interface TestEnv {
  repoDir: string;
  binDir: string;
  cleanup: () => void;
}

/**
 * Creates an isolated temporary git repo with the required file structure
 * for propagate.sh to run. Injects mockable stubs for external CLIs.
 */
function createTestRepo(opts: {
  ipfsAvailable: boolean;
  remotes: string[];
  timestamp: string;
}): TestEnv {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "propagate-test-"));
  const binDir = path.join(repoDir, ".test-bin");

  fs.mkdirSync(binDir);
  fs.mkdirSync(path.join(repoDir, "plan"), { recursive: true });
  fs.mkdirSync(path.join(repoDir, "propagation"), { recursive: true });
  fs.mkdirSync(path.join(repoDir, "scripts"), { recursive: true });

  // Write plan/root.md with version
  fs.writeFileSync(
    path.join(repoDir, "plan", "root.md"),
    `---\nroot: plan/root.md\n---\n# 0 MASTER_PLAN [DONE]\n\n**Version:** ${MANIFEST_VERSION} (Recursive Draft)\n`
  );

  // Write initial propagation/manifest.json
  const manifest = {
    version: "0.0",
    timestamp: "1970-01-01T00:00:00Z",
    propagation_endpoints: [
      { type: "git", label: "GitHub (primary)", url: "https://github.com/test/test", jurisdiction: "US", status: "active" },
      { type: "git", label: "Codeberg (mirror)", url: "https://codeberg.org/test/test", jurisdiction: "EU", status: "pending" },
      { type: "ipfs", label: "IPFS (content-addressed)", cid: null, status: "pending" },
      { type: "arweave", label: "Arweave (permanent storage)", tx_id: null, status: "pending" },
    ],
    content_addressed_endpoints: [
      { type: "ipfs", cid: null, root_md_hash: null },
    ],
  };
  fs.writeFileSync(
    path.join(repoDir, "propagation", "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  // Copy real propagate.sh
  const realScript = path.join(
    __dirname,
    "..",
    "..",
    "scripts",
    "propagate.sh"
  );
  fs.copyFileSync(realScript, path.join(repoDir, "scripts", "propagate.sh"));
  fs.chmodSync(path.join(repoDir, "scripts", "propagate.sh"), 0o755);

  // Initialize git repo and create initial commit
  const execOpts: ExecSyncOptionsWithStringEncoding = {
    cwd: repoDir,
    encoding: "utf-8",
    stdio: "pipe",
  };
  execSync("git init", execOpts);
  execSync('git config user.email "test@test.com"', execOpts);
  execSync('git config user.name "Test"', execOpts);
  execSync("git add -A", execOpts);
  execSync('git commit -m "init"', execOpts);

  // Set up bare remotes for push targets
  for (const remoteName of opts.remotes) {
    const bareDir = path.join(repoDir, `.bare-${remoteName}`);
    execSync(`git init --bare "${bareDir}"`, { encoding: "utf-8", stdio: "pipe" });
    execSync(`git remote add ${remoteName} "${bareDir}"`, execOpts);
    // Push initial commit so remote has the branch
    execSync(`git push ${remoteName} HEAD:main`, execOpts);
  }

  // Create a mock `date` that returns a fixed timestamp for reproducibility
  fs.writeFileSync(
    path.join(binDir, "date"),
    `#!/usr/bin/env bash\nif [[ "$*" == *"%Y-%m"* ]]; then echo "${opts.timestamp}"; else /usr/bin/date "$@"; fi\n`
  );
  fs.chmodSync(path.join(binDir, "date"), 0o755);

  // Create mock ipfs if needed
  if (opts.ipfsAvailable) {
    // Mock ipfs that returns a fake CIDv1
    fs.writeFileSync(
      path.join(binDir, "ipfs"),
      `#!/usr/bin/env bash
if [[ "$*" == *"--only-hash"* ]]; then
  echo "bafkreifakecidhashfortesting00000000000000000000000000000"
elif [[ "$*" == *"add"* ]]; then
  echo "bafkreifakecidhashfortesting00000000000000000000000000000"
else
  echo "mock-ipfs"
fi
`
    );
    fs.chmodSync(path.join(binDir, "ipfs"), 0o755);
  }
  // If !ipfsAvailable, no ipfs stub is created — the script falls back to sha256

  return {
    repoDir,
    binDir,
    cleanup: () => {
      fs.rmSync(repoDir, { recursive: true, force: true });
    },
  };
}

function runPropagate(env: TestEnv, extraPath?: string): { stdout: string; stderr: string; exitCode: number } {
  const pathPrefix = extraPath ? `${extraPath}:` : `${env.binDir}:`;
  try {
    const result = execSync(
      `bash "${path.join(env.repoDir, "scripts", "propagate.sh")}" 2>&1`,
      {
        cwd: env.repoDir,
        encoding: "utf-8",
        stdio: "pipe",
        env: {
          ...process.env,
          PATH: `${pathPrefix}${process.env.PATH}`,
          HOME: env.repoDir,
        },
      }
    );
    // With 2>&1, all output (stdout+stderr) is merged into stdout
    return { stdout: result, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: execErr.stdout ?? "", stderr: execErr.stderr ?? "", exitCode: execErr.status ?? 1 };
  }
}

function readManifest(env: TestEnv): Record<string, unknown> {
  const raw = fs.readFileSync(
    path.join(env.repoDir, "propagation", "manifest.json"),
    "utf-8"
  );
  return JSON.parse(raw);
}

// --- Behavioral Spec Tests ---

describe("propagate.sh", () => {
  let env: TestEnv;

  afterEach(() => {
    if (env) env.cleanup();
  });

  // Scenario 1: Full propagation with IPFS available
  describe("Scenario 1: Full propagation with IPFS available", () => {
    beforeEach(() => {
      env = createTestRepo({
        ipfsAvailable: true,
        remotes: ["origin", "mirror"],
        timestamp: "2026-03-21T12:00:00Z",
      });
    });

    it("pushes to all git remotes", () => {
      const { stdout, exitCode } = runPropagate(env);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Pushing to remote: origin");
      expect(stdout).toContain("Pushing to remote: mirror");
    });

    it("creates a tarball", () => {
      runPropagate(env);
      const tarball = path.join(env.repoDir, "propagation", "master_plan.tar.gz");
      expect(fs.existsSync(tarball)).toBe(true);
    });

    it("records IPFS CIDv1 in manifest", () => {
      runPropagate(env);
      const manifest = readManifest(env) as {
        propagation_endpoints: Array<{ type: string; cid?: string; status: string }>;
        content_addressed_endpoints: Array<{ cid?: string }>;
      };

      const ipfsEndpoint = manifest.propagation_endpoints.find(
        (e) => e.type === "ipfs"
      );
      expect(ipfsEndpoint).toBeDefined();
      expect(ipfsEndpoint!.cid).toMatch(/^bafkrei/);
      expect(ipfsEndpoint!.status).toBe("active");
    });

    it("updates manifest with CID, timestamp, root_md_hash, and version", () => {
      runPropagate(env);
      const manifest = readManifest(env) as {
        version: string;
        timestamp: string;
        content_addressed_endpoints: Array<{ cid: string; root_md_hash: string }>;
      };

      expect(manifest.version).toBe(MANIFEST_VERSION);
      // Timestamp should be ISO-8601 UTC format
      expect(manifest.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(manifest.content_addressed_endpoints[0].cid).toMatch(/^bafkrei/);
      expect(manifest.content_addressed_endpoints[0].root_md_hash).toMatch(/^bafkrei/);
    });

    it("manifest has ≥ MIN_PROPAGATION_ENDPOINTS entries with distinct types", () => {
      runPropagate(env);
      const manifest = readManifest(env) as {
        propagation_endpoints: Array<{ type: string }>;
      };

      expect(manifest.propagation_endpoints.length).toBeGreaterThanOrEqual(
        MIN_PROPAGATION_ENDPOINTS
      );
      const types = new Set(manifest.propagation_endpoints.map((e) => e.type));
      expect(types.size).toBeGreaterThanOrEqual(MIN_PROPAGATION_ENDPOINTS);
    });
  });

  // Scenario 2: Propagation without IPFS (fallback)
  describe("Scenario 2: Propagation without IPFS (fallback to SHA-256)", () => {
    beforeEach(() => {
      env = createTestRepo({
        ipfsAvailable: false,
        remotes: ["origin", "mirror"],
        timestamp: "2026-03-21T12:00:00Z",
      });
    });

    it("completes successfully without ipfs CLI", () => {
      const { exitCode } = runPropagate(env);
      expect(exitCode).toBe(0);
    });

    it("creates a tarball", () => {
      runPropagate(env);
      const tarball = path.join(env.repoDir, "propagation", "master_plan.tar.gz");
      expect(fs.existsSync(tarball)).toBe(true);
    });

    it("records SHA-256 hash prefixed with sha256: as CID fallback", () => {
      runPropagate(env);
      const manifest = readManifest(env) as {
        propagation_endpoints: Array<{ type: string; cid?: string }>;
        content_addressed_endpoints: Array<{ cid: string; root_md_hash: string }>;
      };

      const ipfsEndpoint = manifest.propagation_endpoints.find(
        (e) => e.type === "ipfs"
      );
      expect(ipfsEndpoint).toBeDefined();
      expect(ipfsEndpoint!.cid).toMatch(/^sha256:[a-f0-9]{64}$/);

      // Content-addressed endpoint also uses sha256 fallback
      expect(manifest.content_addressed_endpoints[0].cid).toMatch(
        /^sha256:[a-f0-9]{64}$/
      );
      expect(manifest.content_addressed_endpoints[0].root_md_hash).toMatch(
        /^sha256:[a-f0-9]{64}$/
      );
    });

    it("updates manifest version from root.md", () => {
      runPropagate(env);
      const manifest = readManifest(env) as { version: string };
      expect(manifest.version).toBe(MANIFEST_VERSION);
    });

    it("logs fallback message", () => {
      const { stdout } = runPropagate(env);
      expect(stdout).toContain("IPFS not available");
    });
  });

  // Scenario 3: Git remote push failure (partial)
  describe("Scenario 3: Git remote push failure (partial)", () => {
    beforeEach(() => {
      env = createTestRepo({
        ipfsAvailable: false,
        remotes: ["origin", "mirror", "broken"],
        timestamp: "2026-03-21T12:00:00Z",
      });
      // Break one remote by deleting its bare repo
      const brokenDir = path.join(env.repoDir, ".bare-broken");
      fs.rmSync(brokenDir, { recursive: true, force: true });
    });

    it("does not abort when one remote fails", () => {
      const { exitCode } = runPropagate(env);
      expect(exitCode).toBe(0);
    });

    it("logs a WARNING for the failed remote", () => {
      const { stdout } = runPropagate(env);
      expect(stdout).toContain("WARNING");
      expect(stdout).toContain("broken");
    });

    it("still pushes to remaining remotes", () => {
      const { stdout } = runPropagate(env);
      expect(stdout).toContain("Pushing to remote: origin");
      expect(stdout).toContain("Pushing to remote: mirror");
    });

    it("still computes content hash and updates manifest", () => {
      runPropagate(env);
      const manifest = readManifest(env) as {
        content_addressed_endpoints: Array<{ cid: string }>;
        timestamp: string;
      };
      expect(manifest.content_addressed_endpoints[0].cid).toMatch(
        /^sha256:[a-f0-9]{64}$/
      );
      expect(manifest.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
      );
    });
  });

  // --- Contract invariant tests ---

  describe("Contract invariants", () => {
    beforeEach(() => {
      env = createTestRepo({
        ipfsAvailable: false,
        remotes: ["origin"],
        timestamp: "2026-03-21T12:00:00Z",
      });
    });

    it("exits non-zero when manifest is missing", () => {
      fs.unlinkSync(path.join(env.repoDir, "propagation", "manifest.json"));
      const { exitCode, stdout } = runPropagate(env);
      expect(exitCode).not.toBe(0);
    });

    it("exits non-zero when root.md is missing", () => {
      fs.unlinkSync(path.join(env.repoDir, "plan", "root.md"));
      const { exitCode } = runPropagate(env);
      expect(exitCode).not.toBe(0);
    });

    it("root_md_hash is always derived from actual file content", () => {
      runPropagate(env);
      const manifest = readManifest(env) as {
        content_addressed_endpoints: Array<{ root_md_hash: string }>;
      };
      const hash = manifest.content_addressed_endpoints[0].root_md_hash;
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);

      // Verify by computing SHA-256 of root.md ourselves
      const rootContent = fs.readFileSync(
        path.join(env.repoDir, "plan", "root.md")
      );
      const crypto = require("crypto");
      const expected =
        "sha256:" + crypto.createHash("sha256").update(rootContent).digest("hex");
      expect(hash).toBe(expected);
    });

    it("warns when fewer than MIN_GIT_REMOTES_WARNING remotes push", () => {
      // Only 1 remote configured — should warn
      const { stdout } = runPropagate(env);
      expect(stdout).toContain(
        `Fewer than ${MIN_GIT_REMOTES_WARNING} git remotes`
      );
    });
  });
});
