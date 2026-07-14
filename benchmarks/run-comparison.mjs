import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const baseDir = path.resolve(required(args, "base"));
const headDir = path.resolve(required(args, "head"));
const outputFile = path.resolve(required(args, "output"));
const reportFile = path.resolve(args.report ?? path.join(path.dirname(outputFile), "report.md"));
const rounds = positiveInteger(args.rounds ?? process.env.SOURDOUGH_BENCH_ROUNDS ?? "2", "rounds");
const thresholdsFile = path.resolve(
  args.thresholds ?? path.join(headDir, "benchmarks", "thresholds.json"),
);
const thresholds = JSON.parse(await readFile(thresholdsFile, "utf8"));

await mkdir(path.dirname(outputFile), { recursive: true });
const rawDir = path.join(path.dirname(outputFile), "raw");
await mkdir(rawDir, { recursive: true });

const measurements = { base: [], head: [] };
const schedule = [];
for (let round = 0; round < rounds; round++) {
  schedule.push(...(round % 2 === 0 ? ["base", "head"] : ["head", "base"]));
}

for (const [index, side] of schedule.entries()) {
  const workingDirectory = side === "base" ? baseDir : headDir;
  const rawFile = path.join(rawDir, `${index + 1}-${side}.json`);
  console.log(`\n[${index + 1}/${schedule.length}] Benchmarking ${side} (${workingDirectory})`);
  runVitestBench(workingDirectory, rawFile);
  measurements[side].push(extractBenchmarks(JSON.parse(await readFile(rawFile, "utf8"))));
}

const comparison = compare(measurements, thresholds);
const baseSha = args["base-sha"] ?? gitSha(baseDir);
const headSha = args["head-sha"] ?? gitSha(headDir);
const pullRequest = optionalPositiveInteger(args["pull-request"] ?? process.env.PR_NUMBER);
const runId = String(args["run-id"] ?? process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`);
const cpu = os.cpus();
const result = {
  schemaVersion: 1,
  source: {
    repository: args.repository ?? process.env.GITHUB_REPOSITORY ?? "redwoodjs/sourdough",
    pullRequest,
    baseSha,
    headSha,
    runId,
    runAttempt: String(args["run-attempt"] ?? process.env.GITHUB_RUN_ATTEMPT ?? "1"),
    createdAt: new Date().toISOString(),
  },
  environment: {
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    architecture: os.arch(),
    cpu: cpu[0]?.model ?? "unknown",
    cpuCount: cpu.length,
  },
  policy: {
    rounds,
    schedule,
    defaultMaxRegressionPercent: thresholds.defaultMaxRegressionPercent,
    noisyResultsBecomeWarnings: true,
    removedBenchmarksFail: true,
  },
  summary: comparison.summary,
  benchmarks: comparison.benchmarks,
};

await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`);
await writeFile(reportFile, renderMarkdown(result));
console.log(`\nResult: ${outputFile}`);
console.log(`Report: ${reportFile}`);

if (!result.summary.passed) process.exitCode = 1;

function runVitestBench(workingDirectory, output) {
  const completed = spawnSync(
    "corepack",
    [
      "pnpm",
      "exec",
      "vitest",
      "bench",
      "--run",
      "--no-file-parallelism",
      "--maxWorkers",
      "1",
      "--outputJson",
      output,
    ],
    {
      cwd: workingDirectory,
      env: { ...process.env, CI: "true" },
      stdio: "inherit",
    },
  );
  if (completed.error) throw completed.error;
  if (completed.status !== 0) {
    throw new Error(`Benchmark command failed for ${workingDirectory} with status ${completed.status}`);
  }
}

function extractBenchmarks(raw) {
  const extracted = {};
  for (const file of raw.files ?? []) {
    for (const group of file.groups ?? []) {
      for (const benchmark of group.benchmarks ?? []) {
        if (!isPositiveNumber(benchmark.median)) {
          throw new Error(`Benchmark ${benchmark.name} did not report a positive median`);
        }
        if (Object.hasOwn(extracted, benchmark.name)) {
          throw new Error(`Benchmark names must be globally unique: ${benchmark.name}`);
        }
        extracted[benchmark.name] = {
          medianMs: benchmark.median,
          meanMs: benchmark.mean,
          rme: benchmark.rme,
          samples: benchmark.sampleCount,
        };
      }
    }
  }
  if (Object.keys(extracted).length === 0) {
    throw new Error("No benchmarks were reported");
  }
  return extracted;
}

function compare(allMeasurements, policy) {
  const baseNames = new Set(allMeasurements.base.flatMap(result => Object.keys(result)));
  const headNames = new Set(allMeasurements.head.flatMap(result => Object.keys(result)));
  const names = [...new Set([...baseNames, ...headNames])].sort();
  const benchmarks = {};
  let regressions = 0;
  let warnings = 0;
  let added = 0;
  let removed = 0;

  for (const name of names) {
    const baseRounds = valuesFor(allMeasurements.base, name);
    const headRounds = valuesFor(allMeasurements.head, name);
    const maxRegressionPercent =
      policy.overrides?.[name] ?? policy.defaultMaxRegressionPercent;

    if (baseRounds.length === 0) {
      benchmarks[name] = { status: "added", headRoundsMs: headRounds };
      added++;
      continue;
    }
    if (headRounds.length === 0) {
      benchmarks[name] = { status: "removed", baseRoundsMs: baseRounds };
      removed++;
      continue;
    }
    if (baseRounds.length !== allMeasurements.base.length) {
      throw new Error(`Base benchmark ${name} was missing from one or more rounds`);
    }
    if (headRounds.length !== allMeasurements.head.length) {
      throw new Error(`Head benchmark ${name} was missing from one or more rounds`);
    }

    const baseMedianMs = median(baseRounds);
    const headMedianMs = median(headRounds);
    const changePercent = ((headMedianMs - baseMedianMs) / baseMedianMs) * 100;
    const overThreshold = changePercent > maxRegressionPercent;
    const rangesSeparated = Math.min(...headRounds) > Math.max(...baseRounds);
    const status = overThreshold
      ? rangesSeparated
        ? "regression"
        : "warning"
      : "passed";
    if (status === "regression") regressions++;
    if (status === "warning") warnings++;

    benchmarks[name] = {
      status,
      baseMedianMs,
      headMedianMs,
      changePercent,
      maxRegressionPercent,
      baseRoundsMs: baseRounds,
      headRoundsMs: headRounds,
      rangesSeparated,
    };
  }

  return {
    benchmarks,
    summary: {
      passed: regressions === 0 && removed === 0,
      regressions,
      warnings,
      added,
      removed,
    },
  };
}

function valuesFor(rounds, name) {
  return rounds
    .filter(round => Object.hasOwn(round, name))
    .map(round => round[name].medianMs);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function renderMarkdown(result) {
  const icon = result.summary.passed ? "✅" : "❌";
  const lines = [
    `# ${icon} Sourdough benchmark comparison`,
    "",
    `Base: \`${result.source.baseSha.slice(0, 12)}\` · Head: \`${result.source.headSha.slice(0, 12)}\` · ${result.policy.rounds} rounds per commit`,
    "",
    `Regressions: **${result.summary.regressions}** · Warnings: **${result.summary.warnings}** · Added: **${result.summary.added}** · Removed: **${result.summary.removed}**`,
    "",
    "| Benchmark | Base | Head | Change | Limit | Status |",
    "| --- | ---: | ---: | ---: | ---: | :---: |",
  ];
  const entries = Object.entries(result.benchmarks).sort(([, left], [, right]) =>
    (right.changePercent ?? Number.NEGATIVE_INFINITY) -
    (left.changePercent ?? Number.NEGATIVE_INFINITY),
  );
  for (const [name, benchmark] of entries) {
    lines.push(
      `| \`${name}\` | ${formatDuration(benchmark.baseMedianMs)} | ${formatDuration(benchmark.headMedianMs)} | ${formatPercent(benchmark.changePercent)} | ${benchmark.maxRegressionPercent === undefined ? "—" : `${benchmark.maxRegressionPercent}%`} | ${statusIcon(benchmark.status)} ${benchmark.status} |`,
    );
  }
  lines.push(
    "",
    "A warning exceeded its percentage limit but repeated base/head ranges overlapped. It is recorded without failing the PR.",
  );
  return `${lines.join("\n")}\n`;
}

function formatDuration(milliseconds) {
  if (milliseconds === undefined) return "—";
  if (milliseconds < 0.001) return `${(milliseconds * 1_000_000).toFixed(1)} ns`;
  if (milliseconds < 1) return `${(milliseconds * 1_000).toFixed(2)} µs`;
  return `${milliseconds.toFixed(2)} ms`;
}

function formatPercent(value) {
  if (value === undefined) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function statusIcon(status) {
  return {
    added: "🆕",
    passed: "✅",
    regression: "❌",
    removed: "❌",
    warning: "⚠️",
  }[status];
}

function gitSha(directory) {
  return execFileSync("git", ["-C", directory, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index++) {
    const key = values[index];
    if (!key.startsWith("--")) throw new TypeError(`Unexpected argument ${key}`);
    const value = values[++index];
    if (value === undefined || value.startsWith("--")) {
      throw new TypeError(`Missing value for ${key}`);
    }
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function required(options, key) {
  if (!options[key]) throw new TypeError(`Missing --${key}`);
  return options[key];
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2) {
    throw new TypeError(`${name} must be an integer of at least 2`);
  }
  return parsed;
}

function optionalPositiveInteger(value) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new TypeError(`pull-request must be a positive integer`);
  }
  return parsed;
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
