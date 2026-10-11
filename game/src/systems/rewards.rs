use bevy_ecs::message::{Message, MessageCursor, Messages};
use bevy_ecs::prelude::*;
use bevy_time::Time;

use crate::core::content::Content;
use crate::core::math::Rng;
use crate::core::time::Seconds;
use crate::data;
use crate::systems::combat::Died;
use crate::systems::item::{Reservation, ReservedBy, scatter_drop};
use crate::systems::npc::Npc;
use crate::systems::player::Players;
use crate::systems::visibility::Presence;

#[derive(Message, Clone, Copy, Debug, PartialEq)]
pub struct KillCredited {
    pub npc: data::npc::Id,
    pub victim: Entity,
    pub credited: Entity,
}

pub fn grant(world: &mut World, mut deaths: Local<MessageCursor<Died>>) {
    let content = *world.resource::<Content>();
    let now = Seconds(world.resource::<Time>().elapsed_secs());
    let deaths: Vec<Died> = deaths
        .read(world.resource::<Messages<Died>>())
        .cloned()
        .collect();
    world.resource_scope(|world, mut rng: Mut<Rng>| {
        for died in deaths {
            let Some(npc) = world.get::<Npc>(died.entity).map(|npc| npc.def) else {
                continue;
            };
            let reserved_by = match world.get::<Reservation>(died.entity) {
                Some(reservation) if !reservation.expired(now) => reservation.by,
                _ => ReservedBy::None,
            };
            let rewardee = match reserved_by {
                ReservedBy::Account(client) => world.resource::<Players>().0.get(&client).copied(),
                ReservedBy::None => None,
            };
            if let Some(credited) = rewardee {
                world.write_message(KillCredited {
                    npc,
                    victim: died.entity,
                    credited,
                });
            }
            let Some(loot) = npc.get(&content).loot() else {
                continue;
            };
            if let Some(entity) = rewardee {
                crate::systems::job::grant_xp(world, entity, loot.xp);
            }
            let drops: Vec<(data::item::Id, u32)> = loot
                .items
                .iter()
                .filter(|drop| {
                    drop.chance
                        .is_none_or(|percent| rng.rand_float() * 100.0 < percent)
                })
                .map(|drop| (drop.item, drop.amount))
                .collect();
            let presence = world.get::<Presence>(died.entity).cloned();
            scatter_drop(world, died.entity, &drops, reserved_by, presence);
        }
    });
}
