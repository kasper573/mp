import { type } from "@mp/validate";

export const gameServiceConfigRedisKey = "game-service-config";

export const GameServiceConfig = type({
  isPatchOptimizerEnabled: "boolean",
});

export type GameServiceConfig = typeof GameServiceConfig.infer;

export const onlineCharacterIdsRedisKey = "online-character-ids";
