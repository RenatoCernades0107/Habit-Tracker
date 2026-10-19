/**
 * Runs `worker` over `items` with at most `limit` calls in flight, keeping results in
 * input order. The worker must not throw; callers turn failures into result values.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, run));
  return results;
}
