use bevy_ecs::prelude::*;

use super::AreaTag;
use super::transition::Crossing;
use crate::core::script::{Compiler, EffectCall, EffectDef, EffectStep, Name, OwnerKind};
use crate::systems::dialogue;
use crate::systems::movement;
use crate::systems::npc::Npc;
use crate::systems::player::SpawnPoint;
use crate::systems::reach;
use crate::systems::script::effect::{self as effects, ANY_OWNER, Aim, Arrow};
use crate::systems::script::{Fill, Place, Reach, RiftScripting};

#[derive(Clone)]
pub struct Warp {
    pub who: Aim,
    pub to: Fill<Place>,
    pub next: Arrow,
}

impl EffectDef<RiftScripting> for Warp {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&self) -> Vec<(Name, Arrow)> {
        vec![("next", self.next)]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let who = effects::aim(cx, self.who)?;
        let to = cx.place(&self.to).map_err(effects::bad)?;
        Ok(Box::new(move |world, cx| {
            match effects::aimed(world, cx, &who) {
                Some(actor) => {
                    if let Err(reason) = warp(world, actor, to) {
                        effects::refuse(world, cx, None, reason);
                    }
                }
                None => effects::refuse(world, cx, None, "Nobody to warp"),
            }
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        cx.peek_place(&self.to)
            .map(Reach::Warp)
            .into_iter()
            .collect()
    }
}

pub fn warp(world: &mut World, actor: Entity, to: Place) -> Result<(), &'static str> {
    let here = world.get::<AreaTag>(actor).map(|tag| tag.area);
    if here != Some(to.area) && world.get::<Npc>(actor).is_some() {
        return Err("Npcs stay in their area");
    }
    dialogue::close_for(world, actor);
    reach::forget(world, actor);
    world.entity_mut(actor).insert(SpawnPoint(to.at));
    if here == Some(to.area) {
        movement::relocate(world, actor, to.at);
    } else {
        world.entity_mut(actor).insert(Crossing {
            dest_area: to.area,
            dest: to.at,
        });
    }
    Ok(())
}
