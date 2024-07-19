import { t } from "../definition";
import type { ServerContext } from "../package";
import type { OtherModule } from "./other";

export interface Message {
  from: ServerContext["clientId"];
  contents: string;
}

export function createExampleModule(other: OtherModule) {
  const example = t.module({
    say: t.event.payload<string>().create(({ payload, context }) => {
      example.chat({
        payload: { from: context.clientId, contents: payload },
        context,
      });
    }),
    chat: t.event
      .type("server-to-client")
      .payload<Message>()
      .create(({ context }) => {
        other.do({ context });
      }),
  });

  return example;
}
