import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const inputFile = path.resolve(required(args, "input"));
const resultsRepository = path.resolve(required(args, "results-repository"));
const expectedRunId = String(required(args, "run-id"));
const expectedHeadSha = required(args, "head-sha");
const expectedPullRequest = Number(required(args, "pull-request"));
const raw = await readFile(inputFile, "utf8");
if (Buffer.byteLength(raw) > 5 * 1024 * 1024) {
  throw new Error("Benchmark result exceeds the 5 MiB publication limit");
}
const result = JSON.parse(raw);
validate(result, {
  runId: expectedRunId,
  headSha: expectedHeadSha,
  pullRequest: expectedPullRequest,
});

const source = result.source;
const relativeTarget = source.pullRequest
  ? path.join(
      "pulls",
      String(source.pullRequest),
      source.headSha,
      `${source.runId}.json`,
    )
  : path.join("main", source.headSha, `${source.runId}.json`);
const target = path.join(resultsRepository, relativeTarget);
try {
  await access(target);
  throw new Error(`Refusing to replace immutable result ${relativeTarget}`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
console.log(relativeTarget);

function validate(value, expected) {
  if (value?.schemaVersion !== 1) throw new Error("Unsupported result schema");
  if (value.source?.repository !== "redwoodjs/sourdough") {
    throw new Error("Unexpected source repository");
  }
  if (String(value.source?.runId) !== expected.runId) {
    throw new Error("Artifact run ID does not match the publishing workflow");
  }
  if (value.source?.headSha !== expected.headSha) {
    throw new Error("Artifact head SHA does not match the publishing workflow");
  }
  if (value.source?.pullRequest !== expected.pullRequest) {
    throw new Error("Artifact pull request does not match the publishing workflow");
  }
  if (!/^[a-f0-9]{40}$/.test(value.source?.baseSha)) {
    throw new Error("Invalid base SHA");
  }
  if (!/^[a-f0-9]{40}$/.test(value.source?.headSha)) {
    throw new Error("Invalid head SHA");
  }
  if (
    value.source.pullRequest !== null &&
    (!Number.isInteger(value.source.pullRequest) || value.source.pullRequest < 1)
  ) {
    throw new Error("Invalid pull request number");
  }
  if (typeof value.summary?.passed !== "boolean") {
    throw new Error("Missing comparison status");
  }
  if (!value.benchmarks || typeof value.benchmarks !== "object") {
    throw new Error("Missing benchmark measurements");
  }
  for (const [name, benchmark] of Object.entries(value.benchmarks)) {
    if (!/^[a-z0-9][a-z0-9/_.:-]{0,199}$/.test(name)) {
      throw new Error(`Unsafe benchmark name: ${JSON.stringify(name)}`);
    }
    if (
      !["passed", "warning", "regression", "added", "removed"].includes(
        benchmark.status,
      )
    ) {
      throw new Error(`Invalid benchmark status for ${name}`);
    }
  }
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new TypeError("Arguments must be --name value pairs");
    }
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function required(options, key) {
  if (!options[key]) throw new TypeError(`Missing --${key}`);
  return options[key];
}
