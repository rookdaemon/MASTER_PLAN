/**
 * CLI argument parser tests.
 *
 * The parser is a pure function: argv in, structured options out.
 * No process.argv dependency — fully testable.
 */
import { describe, it, expect } from "vitest";
import { parseCliArgs, type CliOptions } from "../cli.js";

describe("parseCliArgs", () => {
  // Simulate: npx tsx src/agent-runtime/main.ts
  const BASE_ARGV = ["/usr/bin/node", "src/agent-runtime/main.ts"];

  describe("default (no flags)", () => {
    it("returns mode 'agent-loop' when no args given", () => {
      const opts = parseCliArgs(BASE_ARGV);
      expect(opts.mode).toBe("agent-loop");
      expect(opts.prompt).toBeUndefined();
    });
  });

  describe("-p / --prompt flag", () => {
    it("parses -p with a prompt string", () => {
      const opts = parseCliArgs([...BASE_ARGV, "-p", "Hello, world!"]);
      expect(opts.mode).toBe("one-shot");
      expect(opts.prompt).toBe("Hello, world!");
    });

    it("parses --prompt with a prompt string", () => {
      const opts = parseCliArgs([...BASE_ARGV, "--prompt", "Summarise this."]);
      expect(opts.mode).toBe("one-shot");
      expect(opts.prompt).toBe("Summarise this.");
    });

    it("throws if -p is given without a value", () => {
      expect(() => parseCliArgs([...BASE_ARGV, "-p"])).toThrow(
        /requires a value/i
      );
    });

    it("throws if -p value looks like another flag", () => {
      expect(() =>
        parseCliArgs([...BASE_ARGV, "-p", "--model"])
      ).toThrow(/requires a value/i);
    });
  });

  describe("--model flag", () => {
    it("defaults model to claude-sonnet-4-20250514", () => {
      const opts = parseCliArgs([...BASE_ARGV, "-p", "hi"]);
      expect(opts.model).toBe("claude-sonnet-4-20250514");
    });

    it("accepts --model override", () => {
      const opts = parseCliArgs([
        ...BASE_ARGV,
        "-p",
        "hi",
        "--model",
        "claude-opus-4-20250514",
      ]);
      expect(opts.model).toBe("claude-opus-4-20250514");
    });

    it("throws if --model is given without a value", () => {
      expect(() =>
        parseCliArgs([...BASE_ARGV, "-p", "hi", "--model"])
      ).toThrow(/requires a value/i);
    });
  });

  describe("--provider flag", () => {
    it("defaults provider to anthropic-oauth", () => {
      const opts = parseCliArgs([...BASE_ARGV, "-p", "hi"]);
      expect(opts.provider).toBe("anthropic-oauth");
    });

    it("accepts --provider override", () => {
      const opts = parseCliArgs([
        ...BASE_ARGV,
        "-p",
        "hi",
        "--provider",
        "openai",
      ]);
      expect(opts.provider).toBe("openai");
    });

    it("throws on invalid provider", () => {
      expect(() =>
        parseCliArgs([...BASE_ARGV, "-p", "hi", "--provider", "gcp"])
      ).toThrow(/invalid provider/i);
    });
  });

  describe("combined flags", () => {
    it("parses -p, --model, --provider together", () => {
      const opts = parseCliArgs([
        ...BASE_ARGV,
        "-p",
        "Explain consciousness",
        "--model",
        "gpt-4o",
        "--provider",
        "openai",
      ]);
      expect(opts).toEqual<CliOptions>({
        mode: "one-shot",
        prompt: "Explain consciousness",
        model: "gpt-4o",
        provider: "openai",
        stateDir: undefined,
      });
    });

    it("flag order does not matter", () => {
      const opts = parseCliArgs([
        ...BASE_ARGV,
        "--provider",
        "anthropic",
        "--model",
        "claude-opus-4-20250514",
        "-p",
        "Test ordering",
      ]);
      expect(opts.mode).toBe("one-shot");
      expect(opts.prompt).toBe("Test ordering");
      expect(opts.model).toBe("claude-opus-4-20250514");
      expect(opts.provider).toBe("anthropic");
    });
  });

  describe("agent-loop mode defaults", () => {
    it("still provides model and provider defaults in agent-loop mode", () => {
      const opts = parseCliArgs(BASE_ARGV);
      expect(opts.model).toBe("claude-sonnet-4-20250514");
      expect(opts.provider).toBe("anthropic-oauth");
    });
  });

  describe("--state-dir flag", () => {
    it("defaults stateDir to undefined", () => {
      const opts = parseCliArgs(BASE_ARGV);
      expect(opts.stateDir).toBeUndefined();
    });

    it("accepts --state-dir with a path", () => {
      const opts = parseCliArgs([...BASE_ARGV, "--state-dir", "/tmp/agent-state"]);
      expect(opts.stateDir).toBe("/tmp/agent-state");
    });

    it("throws if --state-dir is given without a value", () => {
      expect(() =>
        parseCliArgs([...BASE_ARGV, "--state-dir"])
      ).toThrow(/requires a value/i);
    });

    it("throws if --state-dir value looks like another flag", () => {
      expect(() =>
        parseCliArgs([...BASE_ARGV, "--state-dir", "--provider"])
      ).toThrow(/requires a value/i);
    });

    it("works combined with other flags", () => {
      const opts = parseCliArgs([
        ...BASE_ARGV,
        "--state-dir",
        "/data/state",
        "-p",
        "hello",
        "--model",
        "gpt-4o",
      ]);
      expect(opts.stateDir).toBe("/data/state");
      expect(opts.mode).toBe("one-shot");
      expect(opts.model).toBe("gpt-4o");
    });
  });
});
