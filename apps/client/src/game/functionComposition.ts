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

export function dedupe<Input, Output>(
  fn: (input: Input) => Output,
  isEqual: (a: Input, b: Input) => boolean,
): (input: Input) => Output {
  let previous: { input: Input; output: Output } | undefined;
  return (input: Input): Output => {
    if (previous && isEqual(previous.input, input)) {
      return previous.output;
    }
    const output = fn(input);
    previous = { input, output };
    return output;
  };
}
