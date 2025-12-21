import { ApolloLink, Observable } from "@apollo/client";
import type { ApolloLink as ApolloLinkNS } from "@apollo/client";

export function deferredApolloLink(
  factory: () => Promise<ApolloLink>,
): ApolloLink {
  let linkPromise: Promise<ApolloLink> | null = null;

  return new ApolloLink((operation, forward) => {
    // Initialize once on first request
    if (!linkPromise) {
      linkPromise = factory();
    }

    return new Observable<ApolloLinkNS.Result>((observer) => {
      let subscription: { unsubscribe: () => void } | undefined;
      let cancelled = false;

      void linkPromise
        ?.then((link) => {
          if (cancelled) return;
          const result = link.request(operation, forward);
          if (result) {
            subscription = result.subscribe(observer);
          } else {
            observer.complete();
          }
        })
        .catch((err) => {
          if (!cancelled) observer.error(err);
        });

      return () => {
        cancelled = true;
        subscription?.unsubscribe();
      };
    });
  });
}
