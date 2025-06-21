import type { UserService as IUserService } from "@mp/game/server";
import type { UserId, RoleDefinition, UserIdentity } from "@mp/auth";
import { uniqueNamesGenerator, names } from "unique-names-generator";

export class UserService implements IUserService {
  private info: Map<UserId, UserIdentity> = new Map();

  getName(userId: UserId): Promise<string> {
    const user = this.info.get(userId);
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
  }
  getRoles(userId: UserId): Promise<ReadonlySetLike<RoleDefinition>> {
    const user = this.info.get(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found in memory.`);
    }
    return Promise.resolve(user.roles);
  }

  /**
   * Temporary solution. We should be querying the database for user info.
   * @deprecated
   */
  memorizeUserInfo(identity: UserIdentity) {
    this.info.set(identity.id, identity);
  }
}
