import { execSync } from 'node:child_process';

export interface CliResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

const CLI = ['npx', 'playwright-cli'];
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Execute a playwright-cli command synchronously.
 * Uses child_process.execSync under the hood.
 */
export function execCli(args: string[]): CliResult {
  try {
    const fullCmd = [...CLI, ...args].join(' ');
    const stdout = execSync(fullCmd, {
      encoding: 'utf-8',
      timeout: DEFAULT_TIMEOUT_MS,
    });
    return { success: true, stdout: stdout.trim(), stderr: '' };
  } catch (error) {
    const err = error as Error;
    return { success: false, stdout: '', stderr: err.message };
  }
}

/**
 * Execute a playwright-cli command asynchronously.
 * Uses Bun.spawn with configurable timeout.
 */
export async function execCliAsync(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliResult> {
  try {
    const proc = Bun.spawn([...CLI, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms: npx playwright-cli ${args.join(' ')}`));
      }, timeoutMs);
    });

    const exitCode = await Promise.race([proc.exited, timedOut]);
    clearTimeout(timer);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return {
      success: exitCode === 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const err = error as Error;
    return { success: false, stdout: '', stderr: err.message };
  }
}
