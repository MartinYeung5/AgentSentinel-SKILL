/**
 * Minimal zero-dependency test runner.
 * Usage:
 *   tsx tests/runner.ts        (loaded via npm test)
 */
type TestFn = () => void | Promise<void>;
interface TestCase { name: string; fn: TestFn; suite: string }

const cases: TestCase[] = [];
let currentSuite = "default";

export function describe(name: string, fn: () => void): void {
  const prev = currentSuite;
  currentSuite = name;
  fn();
  currentSuite = prev;
}

export function it(name: string, fn: TestFn): void {
  cases.push({ name, fn, suite: currentSuite });
}

export function assert(cond: unknown, msg = "assertion failed"): void {
  if (!cond) throw new Error(msg);
}
export function assertEqual<T>(a: T, b: T, msg?: string): void {
  if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
}

export async function run(): Promise<void> {
  let passed = 0;
  let failed = 0;
  const fails: string[] = [];
  for (const c of cases) {
    try {
      await c.fn();
      passed++;
      // eslint-disable-next-line no-console
      console.log(`  \u2713 [${c.suite}] ${c.name}`);
    } catch (e: any) {
      failed++;
      fails.push(`[${c.suite}] ${c.name}: ${e?.message ?? e}`);
      // eslint-disable-next-line no-console
      console.log(`  \u2717 [${c.suite}] ${c.name}  --  ${e?.message ?? e}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    // eslint-disable-next-line no-console
    console.error("\nFailures:\n" + fails.join("\n"));
    process.exit(1);
  }
}
