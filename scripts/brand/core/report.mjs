/**
 * Run output that cannot lie.
 *
 * A generator that could not run says `SKIPPED` and why. A generator that wrote nothing
 * says `generated 0`, which reads as suspicious rather than tidy. Failures are collected
 * so one bad family does not hide the ones after it, and the exit code is the tally.
 */
const lines = [];
const failures = [];

export const ok = (label, detail) => {
  lines.push(`ok    ${label}${detail === undefined ? "" : `  ${detail}`}`);
};

export const generated = (label, count, detail) => {
  lines.push(`gen   ${label}  ${count} file(s)${detail === undefined ? "" : `  ${detail}`}`);
  if (count === 0) failures.push(`${label} generated nothing`);
};

export const skip = (label, reason) => {
  lines.push(`SKIP  ${label}  ${reason}`);
};

export const fail = (label, reason) => {
  lines.push(`FAIL  ${label}${reason === undefined ? "" : `  ${reason}`}`);
  failures.push(reason === undefined ? label : `${label}: ${reason}`);
};

/** Print what has been recorded so far without deciding the exit code. */
export const flush = () => {
  for (const line of lines) console.log(line);
  lines.length = 0;
};

/** Print what happened and optionally fail the process. */
export const summarise = ({ exitOnFailure = true } = {}) => {
  flush();
  if (failures.length > 0) {
    console.error(`\n${failures.length} brand problem(s):`);
    for (const failure of failures) console.error(`  ${failure}`);
    const problems = failures.length;
    failures.length = 0;
    if (exitOnFailure) process.exitCode = 1;
    return problems;
  }
  return 0;
};

/** Wrapped in a function so a test can clear state without reloading the module graph. */
export const resetReport = () => {
  lines.length = 0;
  failures.length = 0;
};
