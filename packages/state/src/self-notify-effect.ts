import { type ReadonlyAtom } from "./atom";

/**
 * Useful when an atom holds a value that is also (or contains) an atom.
 * This effect will automatically subscribe to the inner atom and notify the outer atom
 * whenever the inner atom changes.
 */
export function selfNotifyEffect<T>(
  outerAtom: ReadonlyAtom<T>,
  innerAtom: (value: T) => ReadonlyAtom | undefined,
) {
  console.log("selfNotifyEffect started");
  let unsubscribeFromInner: undefined | (() => void);
  const unsubscribeFromOuter = outerAtom.subscribe((next, prev) => {
    if (next === prev) {
      return;
    }

    console.log(
      "selfNotifyEffect: outer atom changed, listening to new inner atom",
      { next, prev },
    );
    unsubscribeFromInner?.();
    unsubscribeFromInner = innerAtom(next)?.listen(() => {
      console.log("selfNotifyEffect: notifying outer atom");
      outerAtom.notify();
    });
  });

  return function stopEffect() {
    unsubscribeFromInner?.();
    unsubscribeFromOuter();
  };
}
