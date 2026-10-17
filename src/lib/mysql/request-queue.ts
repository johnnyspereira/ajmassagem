/** Bound browser query bursts to the capacity of the shared cPanel runtime. */
export function createRequestQueue(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error('Invalid concurrency');
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function schedule<T>(work: () => Promise<T>): Promise<T> {
    if (active >= concurrency)
      await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

export const scheduleMysqlRequest = createRequestQueue(3);
