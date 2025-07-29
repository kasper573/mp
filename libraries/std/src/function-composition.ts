export function throttle<T extends (...args: never[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let last = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last > ms) {
      last = now;
      fn(...args);
    }
  };
}

export function debounce<T extends (...args: never[]) => unknown>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, ms);
  };
}

export function dedupe<Args extends unknown[], Output>(
  fn: (...args: Args) => Output,
  isEqual: (a: Args, b: Args) => boolean,
) {
  let previous: { args: Args; output: Output } | undefined;
  function dedupedFn(...args: Args): Output {
    if (previous && isEqual(previous.args, args)) {
      return previous.output;
    }
    const output = fn(...args);
    previous = { args, output };
    return output;
  }

  dedupedFn.clear = () => {
    previous = undefined;
  };

  return dedupedFn;
}
