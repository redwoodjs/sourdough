const time = positiveNumber(process.env.SOURDOUGH_BENCH_TIME, 1_000);
const warmupTime = positiveNumber(
  process.env.SOURDOUGH_BENCH_WARMUP_TIME,
  100,
);

/** Shared timing policy for every Sourdough microbenchmark. */
export const benchmarkOptions = Object.freeze({
  time,
  warmupTime,
});

function positiveNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TypeError(`Expected a positive benchmark duration, received ${value}`);
  }
  return parsed;
}
