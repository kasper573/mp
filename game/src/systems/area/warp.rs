use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::AreaTag;
use super::transition::Crossing;
use crate::core::script::{Compiler, EffectDef, EffectStep, Name, ScriptFault};
use crate::systems::dialogue;
use crate::systems::movement;
use crate::systems::npc::Npc;
use crate::systems::player::SpawnPoint;
use crate::systems::reach;
use crate::systems::script::effect::{self as effects, Aim, Arrow, Link};
use crate::systems::script::{EffectCall, Fill, Place, Reach, RiftScripting};

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Warp {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub who: Aim,
    pub to: Fill<Place>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

impl EffectDef<RiftScripting> for Warp {
    fn needs_subject(&self) -> bool {
        self.who.is_none()
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, ScriptFault> {
        let who = effects::aim(cx, &self.who)?;
        let to = cx.place(&self.to)?;
        Ok(Box::new(move |world, _, cx| {
            let warped = effects::aimed(world, cx, &who)
                .ok_or_else(|| "Nobody to warp".to_owned())
                .and_then(|actor| warp(world, actor, to));
            if let Err(reason) = warped {
                effects::show_error(world, cx, reason);
            }
            EffectStep::Done
        }))
    }
    fn reach(&self, cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        cx.peek_place(&self.to)
            .map(Reach::Warp)
            .into_iter()
            .collect()
    }
}

pub fn warp(world: &mut World, actor: Entity, to: Place) -> Result<(), String> {
    let here = world.get::<AreaTag>(actor).map(|tag| tag.area);
    if here != Some(to.area) && world.get::<Npc>(actor).is_some() {
        return Err("Npcs stay in their area".to_owned());
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
