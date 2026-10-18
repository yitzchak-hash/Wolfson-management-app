/**
 * Run `fn` over `items` with at most `size` running at once — the worker's
 * picked pictures upload side by side instead of one after another.
 *
 * Three is the size the portal uses: on a phone's upload link one file rarely
 * fills the pipe (each one starts with a session round trip and a slow TCP
 * start), while a dozen at once just share the same bandwidth and finish all
 * at the end. A failure in one item never stops the others — `fn` is expected
 * to catch its own errors.
 */
export async function runPool<T>(items: T[], size: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, lane));
}
