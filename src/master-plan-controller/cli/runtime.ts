export interface CliRuntime {
  arguments(): string[];
  environment(name: string): string | undefined;
  write(message: string): void;
  writeError(message: string): void;
  fail(): void;
}

export class NodeCliRuntime implements CliRuntime {
  arguments(): string[] {
    return process.argv.slice(2);
  }

  environment(name: string): string | undefined {
    return process.env[name];
  }

  write(message: string): void {
    process.stdout.write(`${message}\n`);
  }

  writeError(message: string): void {
    process.stderr.write(`${message}\n`);
  }

  fail(): void {
    process.exitCode = 1;
  }
}

export function argumentValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
