/**
 * General debounce utility with cancel and flush support.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): ((...args: Parameters<T>) => void) & { cancel: () => void; flush: (...args: Parameters<T>) => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      const argsToCall = lastArgs;
      lastArgs = null;
      if (argsToCall) {
        fn(...argsToCall);
      }
    }, delayMs);
  };

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  debounced.flush = (...args: Parameters<T>) => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const argsToCall = args.length > 0 ? args : lastArgs;
    lastArgs = null;
    if (argsToCall) {
      fn(...argsToCall);
    }
  };

  return debounced;
}
