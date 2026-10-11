use bevy_ecs::prelude::*;
use bevy_terminal::TerminalInbox;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::content::Content;
use crate::core::script::{
    Compiler, EffectCall, EffectDef, EffectStep, Name, OwnerKind, ValueType,
};
use crate::core::tiling::{TilePos, Tiles};
use crate::systems::actor::Name as ActorName;
use crate::systems::area::AreaTag;
use crate::systems::movement::position;
use crate::systems::notification::{self, Notification, NotificationKind};
use crate::systems::npc::Npc;
use crate::systems::player::{self, ClientId, Players};
use crate::systems::script::effect::{self as effects, Arrow, Link};
use crate::systems::script::{Condition, Reach, RiftScripting};
use crate::systems::terminal::TerminalKind;
use crate::systems::text::{self, LineText, Span};
use crate::systems::visibility::{self, VIEW_DISTANCE};

const OBJECT_OR_NPC: &[OwnerKind] = &[OwnerKind::Object, OwnerKind::Npc];

pub fn rebroadcast(world: &mut World) {
    let entries = world.resource::<TerminalInbox<TerminalKind>>().0.clone();
    for entry in entries.iter().filter(|entry| !entry.consumed()) {
        let name = player::conn_player(world, entry.conn)
            .and_then(|player| world.get::<ActorName>(player))
            .map(|name| name.name.clone())
            .or_else(|| {
                world
                    .get::<ClientId>(entry.conn)
                    .map(|client| format!("player {}", client.0))
            })
            .unwrap_or_else(|| "player".to_owned());
        bevy_terminal::broadcast(world, entry.terminal, format!("{name}: {}", entry.text));
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Say {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub text: Vec<Span>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub within: Option<Condition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

impl EffectDef<RiftScripting> for Say {
    fn owners(&self) -> &'static [OwnerKind] {
        OBJECT_OR_NPC
    }
    fn needs_subject(&self) -> bool {
        false
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let values = text::values(&self.text)
            .into_iter()
            .map(|value| cx.expr(value, ValueType::Text).map_err(effects::bad))
            .collect::<Result<Vec<_>, _>>()?;
        let within = cx
            .opt_expr(self.within.as_ref(), ValueType::Number)
            .map_err(effects::bad)?;
        let spans = self.text.as_slice();
        Ok(Box::new(move |world, cx| {
            let Some(speaker) = cx.owner.entity() else {
                return EffectStep::Output(0);
            };
            let spoken: Vec<_> = values.iter().map(|value| value(world, cx)).collect();
            let within = within.as_ref().map_or(VIEW_DISTANCE, |within| {
                Tiles(within(world, cx).as_num() as f32)
            });
            say(world, speaker, LineText::spoken(spans, &spoken), within);
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, _cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        vec![Reach::Says]
    }
}

pub fn say(world: &mut World, speaker: Entity, text: LineText, within: Tiles) {
    let name = world
        .get::<ActorName>(speaker)
        .map(|name| name.name.clone())
        .unwrap_or_default();
    let words = text.words(&crate::systems::input::map::InputMap::new(
        world.resource::<Content>(),
    ));
    bevy_terminal::broadcast(world, TerminalKind::Global, format!("{name}: {words}"));
    let kind = match world.get::<Npc>(speaker) {
        Some(npc) => NotificationKind::Speech { speaker: npc.def },
        None => NotificationKind::Narration {
            label: name.into(),
            sfx: None,
        },
    };
    let (Some(at), Some(area)) = (
        position(world, speaker),
        world.get::<AreaTag>(speaker).map(|tag| tag.area),
    ) else {
        return;
    };
    let listeners: Vec<Entity> = world
        .resource::<Players>()
        .0
        .values()
        .copied()
        .filter(|player| {
            world
                .get::<AreaTag>(*player)
                .is_some_and(|tag| tag.area == area)
        })
        .filter(|player| position(world, *player).is_some_and(|there| there.distance(at) <= within))
        .filter(|player| visibility::present(world, speaker, *player))
        .collect();
    for player in listeners {
        notification::notify_from(
            world,
            player,
            Some(speaker),
            Notification::new(kind.clone(), text.clone()),
        );
    }
}
