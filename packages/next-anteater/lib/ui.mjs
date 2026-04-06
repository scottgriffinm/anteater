/**
 * Terminal UI helpers — zero dependencies.
 *
 * Handles both interactive (TTY) and piped (file/pipe) input.
 * When stdin is piped, pre-reads all lines and serves them sequentially.
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

// ─── Piped input support ────────────────────────────────────────
// When stdin is piped (not a TTY), pre-read all lines into a queue.
// This avoids readline issues where EOF closes the interface mid-setup.

let _pipedLines = null;
let _pipedReady = null;

if (!process.stdin.isTTY) {
  _pipedLines = [];
  _pipedReady = new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    rl.on("line", (line) => _pipedLines.push(line));
    rl.on("close", resolve);
  });
}

let _pipedIdx = 0;

async function nextPipedLine() {
  await _pipedReady;
  if (_pipedIdx < _pipedLines.length) {
    return _pipedLines[_pipedIdx++];
  }
  return "";
}

// ─── Interactive readline (TTY only) ────────────────────────────

let _rl = null;

function getRL() {
  if (!_rl) {
    _rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return _rl;
}

export function closeRL() {
  if (_rl) {
    _rl.close();
    _rl = null;
  }
}

/**
 * Prompt the user for text input.
 */
export function ask(question, { mask = false } = {}) {
  // Piped mode — read next line from pre-buffered input
  if (_pipedLines) {
    const prompt = `  ${cyan("?")} ${question} `;
    process.stdout.write(prompt);
    return nextPipedLine().then((line) => {
      process.stdout.write("\n");
      return line.trim();
    });
  }

  // Interactive mode — use readline
  return new Promise((resolve) => {
    const rl = getRL();

    if (mask) {
      const origWrite = process.stdout.write.bind(process.stdout);
      const restore = () => { process.stdout.write = origWrite; };

      process.stdout.write = (chunk, encoding, cb) => {
        if (typeof chunk === "string" && chunk.includes(question)) {
          return origWrite(chunk, encoding, cb);
        }
        const masked = typeof chunk === "string" ? chunk.replace(/[^\r\n]/g, "•") : chunk;
        return origWrite(masked, encoding, cb);
      };

      rl.question(`  ${cyan("?")} ${question} `, (answer) => {
        restore();
        resolve(answer.trim());
      });
    } else {
      rl.question(`  ${cyan("?")} ${question} `, (answer) => {
        resolve(answer.trim());
      });
    }
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
