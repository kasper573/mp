import type { Entity } from "@rift/core";
import { defineModule } from "@rift/modular";
import { AreaMember, ClientSession } from "../../components";
import { ChatMessage } from "../../events";
import { AreaModule } from "../area/module";

export interface ChatApi {
  say(speaker: Entity, text: string): void;
}

export const ChatModule = defineModule({
  dependencies: [AreaModule] as const,
  server: (ctx): { api: ChatApi } => {
    const say: ChatApi["say"] = (speaker, text) => {
      if (!speaker.has(AreaMember)) return;
      const areaId = speaker.get(AreaMember).areaId;
      const recipients: string[] = [];
      for (const e of ctx.rift.query(ClientSession, AreaMember).value) {
        if (e.get(AreaMember).areaId !== areaId) continue;
        recipients.push(e.get(ClientSession).clientId);
      }
      if (recipients.length === 0) return;
      ctx.rift
        .emit(ChatMessage, { fromEntityId: speaker.id, text })
        .to(...recipients);
    };

    ctx.rift.on(ChatMessage, (clientId, data) => {
      const speaker = findEntityByClientId(
        ctx.rift.query(ClientSession).value,
        clientId,
      );
      if (!speaker) return;
      say(speaker, data.text);
    });

    return { api: { say } };
  },
  client: (): { api: Record<string, never> } => ({ api: {} }),
});

function findEntityByClientId(
  entities: Entity[],
  clientId: string,
): Entity | undefined {
  for (const e of entities) {
    if (e.get(ClientSession).clientId === clientId) return e;
  }
  return undefined;
}
