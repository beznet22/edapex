#!/usr/bin/env node
/**
 * Validates the 53-row service method map (`02 §5`).
 *
 * The reconciled partition is 37 unique destinations + 2 duplicate merges +
 * 7 deleted + 5 retired + 2 out of scope = 53. `--self-test` proves the
 * validator rejects duplicates, missing destinations and bad counts.
 */
import { EXPECTED_COUNTS, SERVICE_METHOD_MAP, validateMethodMap } from "./service-method-map.mjs";

function report(label, failures) {
  if (failures.length === 0) {
    console.log(`${label} passed`);
    return true;
  }
  console.error(`${label} failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  return false;
}

const clean = report("service map", validateMethodMap(SERVICE_METHOD_MAP));
const counts = SERVICE_METHOD_MAP.reduce((acc, row) => {
  acc[row.disposition] = (acc[row.disposition] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `rows: ${SERVICE_METHOD_MAP.length} (${EXPECTED_COUNTS.mapped} mapped, ${EXPECTED_COUNTS.merged} merged, ${EXPECTED_COUNTS.deleted} deleted, ${EXPECTED_COUNTS.retired} retired, ${EXPECTED_COUNTS.out_of_scope} out of scope)`
);
console.log(
  `counts: ${counts.mapped ?? 0} mapped, ${counts.merged ?? 0} merged, ${counts.deleted ?? 0} deleted, ${counts.retired ?? 0} retired, ${counts.out_of_scope ?? 0} out of scope`
);

if (process.argv.includes("--self-test")) {
  const duplicate = [...SERVICE_METHOD_MAP, { ...SERVICE_METHOD_MAP[0] }];
  const mapped = SERVICE_METHOD_MAP.find((row) => row.disposition === "mapped");
  if (mapped === undefined) throw new Error("service map has no mapped row for self-test");
  const missingDestination = SERVICE_METHOD_MAP.map((row) =>
    row === mapped ? { ...row, destination: null } : row
  );
  const badCount = SERVICE_METHOD_MAP.filter((row) => row !== SERVICE_METHOD_MAP[0]);

  const checks = [
    report("self-test duplicate detection", validateMethodMap(duplicate)),
    report("self-test missing destination", validateMethodMap(missingDestination)),
    report("self-test count detection", validateMethodMap(badCount))
  ];

  if (!checks.every((passed) => passed === false)) {
    console.error("service map self-test failed: a seeded violation was accepted");
    process.exit(1);
  }
  console.log("service map self-test passed: seeded violations detected");
}

process.exit(clean ? 0 : 1);
