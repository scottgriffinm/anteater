/**
 * Terminal UI helpers — zero dependencies.
 */
import * as readline from "node:readline";

// ANSI colors
const esc = (code) => `\x1b[${code}m`;
export const bold = (s) => `${esc(1)}${s}${esc(22)}`;
export const dim = (s) => `${esc(2)}${s}${esc(22)}`;
export const green = (s) => `${esc(32)}${s}${esc(39)}`;
export const red = (s) => `${esc(31)}${s}${esc(39)}`;
export const yellow = (s) => `${esc(33)}${s}${esc(39)}`;
export const cyan = (s) => `${esc(36)}${s}${esc(39)}`;

export const ok = (msg) => console.log(`  ${green("✓")} ${msg}`);
export const fail = (msg) => console.log(`  ${red("✗")} ${msg}`);
export const warn = (msg) => console.log(`  ${yellow("!")} ${msg}`);
export const info = (msg) => console.log(`  ${dim(msg)}`);
export const heading = (msg) => console.log(`\n  ${bold(msg)}\n  ${"─".repeat(msg.length)}`);
export const blank = () => console.log();

/**
 * Prompt the user for text input.
 */
export function ask(question, { mask = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // If masking, mute output and write dots
    if (mask) {
      const origWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk, encoding, cb) => {
        // Let the question prompt through, mask everything after
        if (typeof chunk === "string" && chunk.includes(question)) {
          return origWrite(chunk, encoding, cb);
        }
        // Replace characters with bullets
        const masked = typeof chunk === "string" ? chunk.replace(/[^\r\n]/g, "•") : chunk;
        return origWrite(masked, encoding, cb);
      };

      rl.on("close", () => {
        process.stdout.write = origWrite;
      });
    }

    rl.question(`  ${cyan("?")} ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt yes/no (defaults to yes).
 */
export async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await ask(`${question} ${dim(`(${hint})`)}`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

/**
 * Prompt user to select from a list.
 */
export async function select(question, options) {
  console.log(`  ${cyan("?")} ${question}`);
  for (let i = 0; i < options.length; i++) {
    const marker = i === 0 ? green("❯") : " ";
    console.log(`    ${marker} ${options[i].label}${options[i].hint ? dim(` — ${options[i].hint}`) : ""}`);
  }
  const answer = await ask(`Enter choice (1-${options.length}):`, {});
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < options.length) return options[idx].value;
  return options[0].value; // default to first
}

/**
 * Show a spinner while an async function runs.
 */
export async function spinner(msg, fn) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${green(frames[i++ % frames.length])} ${msg}`);
  }, 80);

  try {
    const result = await fn();
    clearInterval(interval);
    process.stdout.write(`\r  ${green("✓")} ${msg}\n`);
    return result;
  } catch (err) {
    clearInterval(interval);
    process.stdout.write(`\r  ${red("✗")} ${msg}\n`);
    throw err;
  }
}
