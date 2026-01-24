import type { Int } from "grats";

/** @gqlSubscriptionField */
export async function* countdown(): AsyncIterable<Int> {
  for (let i = 10; i >= 0; i--) {
    // oxlint-disable-next-line no-await-in-loop
    await sleep(1);
    yield i;
  }
}

function sleep(s: number) {
  return new Promise((resolve) => setTimeout(resolve, s * 1000));
}
