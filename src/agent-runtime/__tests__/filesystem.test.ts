/**
 * IFileSystem abstraction tests.
 *
 * Validates that InMemoryFileSystem correctly implements the IFileSystem
 * contract, which is also used to test PersistenceManager without real disk I/O.
 */
import { describe, it, expect } from "vitest";
import { InMemoryFileSystem } from "../filesystem.js";

describe("InMemoryFileSystem", () => {
  it("starts with no files", () => {
    const fs = new InMemoryFileSystem();
    expect(fs.exists("/foo.json")).toBe(false);
  });

  it("writes and reads a file", async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile("/state/model.json", '{"ok":true}', "utf-8");
    const content = await fs.readFile("/state/model.json", "utf-8");
    expect(content).toBe('{"ok":true}');
  });

  it("exists returns true after write", async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile("/a.txt", "hello", "utf-8");
    expect(fs.exists("/a.txt")).toBe(true);
  });

  it("mkdir is a no-op (no real directory needed)", async () => {
    const fs = new InMemoryFileSystem();
    await fs.mkdir("/deep/nested/dir", { recursive: true });
    // No error — that's the contract
  });

  it("readFile throws on missing file", async () => {
    const fs = new InMemoryFileSystem();
    await expect(fs.readFile("/missing.json", "utf-8")).rejects.toThrow(
      /ENOENT/
    );
  });

  it("overwrites an existing file", async () => {
    const fs = new InMemoryFileSystem();
    await fs.writeFile("/f.txt", "v1", "utf-8");
    await fs.writeFile("/f.txt", "v2", "utf-8");
    const content = await fs.readFile("/f.txt", "utf-8");
    expect(content).toBe("v2");
  });
});
