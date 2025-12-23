import { ApolloLink, Observable } from "@apollo/client";

export function deferredApolloLink(
  factory: () => Promise<ApolloLink>,
): ApolloLink {
  let linkPromise: Promise<ApolloLink> | null = null;

  return new ApolloLink((operation, forward) => {
    if (!linkPromise) {
      linkPromise = factory();
    }

    return new Observable<ApolloLink.Result>((observer) => {
      let subscription: { unsubscribe: () => void } | undefined;
      let cancelled = false;

      void linkPromise
        ?.then((link) => {
          if (cancelled) {
            return;
          }

          const result = link.request(operation, forward);
          if (result) {
            subscription = result.subscribe(observer);
          } else {
            observer.complete();
          }
        })
        .catch((err) => {
          if (!cancelled) {
            observer.error(err);
          }
        });

      return () => {
        cancelled = true;
        subscription?.unsubscribe();
      };
    });
  });
}
