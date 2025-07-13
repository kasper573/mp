import type { UserService } from "@mp/game";
import type { UserId, UserIdentity } from "@mp/auth";
import { uniqueNamesGenerator, names } from "unique-names-generator";

export function createUserService(): UserServiceImpl {
  const info = new Map<UserId, UserIdentity>();

  return {
    getName(userId) {
      const user = info.get(userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found in memory.`);
      }
      return Promise.resolve(
        user.name ??
          uniqueNamesGenerator({
            dictionaries: [names],
            seed: userId,
          }),
      );
    },

    getRoles(userId) {
      const user = info.get(userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found in memory.`);
      }
      return Promise.resolve(user.roles);
    },

    /**
     * Temporary solution. We should be querying the database for user info.
     * @deprecated
     */
    memorizeUserInfo(identity) {
      info.set(identity.id, identity);
    },
  };
}

interface UserServiceImpl extends UserService {
  memorizeUserInfo(identity: UserIdentity): void;
}
