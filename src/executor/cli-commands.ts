import { execCli, type CliResult } from './cli-runner';

/**
 * Navigate the current browser to a URL.
 */
export async function navigate(url: string): Promise<CliResult> {
  return execCli(['goto', url]);
}

/**
 * Take an accessibility tree snapshot.
 * Optional depth controls how deeply the tree is traversed.
 */
export async function snapshot(depth?: number): Promise<CliResult> {
  const args = ['snapshot'];
  if (depth !== undefined) args.push(String(depth));
  return execCli(args);
}

/**
 * Take a screenshot of the current viewport.
 * Optional filename to save the screenshot as.
 */
export async function screenshot(filename?: string): Promise<CliResult> {
  const args = ['screenshot'];
  if (filename) args.push(filename);
  return execCli(args);
}

/**
 * Click an element identified by its accessibility ref (e.g. "eN").
 */
export async function click(ref: string): Promise<CliResult> {
  return execCli(['click', ref]);
}

/**
 * Type text into the currently focused element.
 */
export async function type(text: string): Promise<CliResult> {
  return execCli(['type', text]);
}

/**
 * Fill a form field identified by its accessibility ref with the given text.
 */
export async function fill(ref: string, text: string): Promise<CliResult> {
  return execCli(['fill', ref, text]);
}

/**
 * Press a keyboard key (e.g. "Enter", "Tab", "Escape").
 */
export async function press(key: string): Promise<CliResult> {
  return execCli(['press', key]);
}
