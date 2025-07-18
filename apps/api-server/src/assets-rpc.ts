import { rpc } from "@mp/game/server";
import { serverFileToPublicUrl } from "@mp/server-common";
import type { LocalFile } from "@mp/std";

export const assetsRouter = rpc.router({
  getAreaFileUrl: rpc.procedure
    .input<string>()
    .output<string>()
    .query(({ input: areaId }) => {
      return serverFileToPublicUrl(`areas/${areaId}.json` as LocalFile);
    }),
});
