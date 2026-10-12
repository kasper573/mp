use bevy_ecs::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::{Condition, Reach, RiftScripting};
use crate::core::audio::playback::SfxId;
use crate::core::content::Fixture;
use crate::core::script::{
    Compiler, EffectCall, EffectDef, EffectStep, Eval, FlowCx, Name, OwnerKind, ValueType,
};
use crate::systems::area::warp::Warp;
use crate::systems::chat::Say;
use crate::systems::item::effects::{
    ClearGroundItems, DropItems, Equip, Items, MoveItems, SpawnGroundItems, Unequip, UseItem,
};
use crate::systems::job::{GrantXp, SetJob};
use crate::systems::memory::{Forget, Remember};
use crate::systems::notification::{self, Notification, NotificationKind, Notify};
use crate::systems::npc::body::{Attack, FaceToward, Stop, WalkTo, Wander};
use crate::systems::npc::summon::{Despawn, SetAttitude, SpawnNpcs};
use crate::systems::quest::effects::{
    AcceptQuest, CompleteTask, Decide, FailQuest, OfferQuest, TurnIn,
};
use crate::systems::shop::OpenShop;
use crate::systems::stat::effects::{Buff, ClearBuffs, Damage, Heal};
use crate::systems::text::LineText;

pub type Arrow = crate::core::script::Arrow;
pub type Link = crate::core::script::Link;
pub type Aim = Option<Condition>;

macro_rules! effects {
    ($($variant:ident($ty:ty)),* $(,)?) => {
        #[derive(JsonSchema, Clone, Serialize, Deserialize)]
        #[serde(tag = "type", rename_all = "snake_case")]
        pub enum RiftEffect {
            $($variant($ty),)*
        }

        impl EffectDef<RiftScripting> for RiftEffect {
            fn owners(&self) -> &'static [OwnerKind] {
                match self { $(RiftEffect::$variant(e) => e.owners(),)* }
            }
            fn needs_subject(&self) -> bool {
                match self { $(RiftEffect::$variant(e) => e.needs_subject(),)* }
            }
            fn outputs(&'static self) -> Vec<(Name, Link)> {
                match self { $(RiftEffect::$variant(e) => e.outputs(),)* }
            }
            fn pauses(&self) -> bool {
                match self { $(RiftEffect::$variant(e) => e.pauses(),)* }
            }
            fn keeps_box(&self) -> bool {
                match self { $(RiftEffect::$variant(e) => e.keeps_box(),)* }
            }
            fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
                match self { $(RiftEffect::$variant(e) => e.compile(cx),)* }
            }
            fn reach(&self, cx: &Compiler<RiftScripting>) -> Vec<Reach> {
                match self { $(RiftEffect::$variant(e) => e.reach(cx),)* }
            }
        }

        impl RiftEffect {
            pub fn kind(&self) -> &'static str {
                match self { $(RiftEffect::$variant(_) => stringify!($variant),)* }
            }
        }
    };
}

effects! {
    Warp(Warp),
    Heal(Heal),
    Damage(Damage),
    Buff(Buff),
    ClearBuffs(ClearBuffs),
    Items(Items),
    UseItem(UseItem),
    Equip(Equip),
    Unequip(Unequip),
    DropItems(DropItems),
    SpawnGroundItems(SpawnGroundItems),
    ClearGroundItems(ClearGroundItems),
    MoveItems(MoveItems),
    GrantXp(GrantXp),
    SetJob(SetJob),
    Remember(Remember),
    Forget(Forget),
    OfferQuest(OfferQuest),
    AcceptQuest(AcceptQuest),
    TurnIn(TurnIn),
    FailQuest(FailQuest),
    CompleteTask(CompleteTask),
    Decide(Decide),
    OpenShop(OpenShop),
    Notify(Notify),
    Say(Say),
    Wander(Wander),
    WalkTo(WalkTo),
    Attack(Attack),
    Stop(Stop),
    Face(FaceToward),
    SetAttitude(SetAttitude),
    SpawnNpcs(SpawnNpcs),
    Despawn(Despawn),
    PlaySound(PlaySound),
}

pub const ANY_OWNER: &[OwnerKind] = &[
    OwnerKind::Object,
    OwnerKind::Npc,
    OwnerKind::Item,
    OwnerKind::Area,
    OwnerKind::Quest,
    OwnerKind::Shop,
    OwnerKind::Blueprint,
    OwnerKind::Any,
];

pub fn bad(e: (&str, String)) -> String {
    format!("{}: {}", e.0, e.1)
}

pub fn aim(cx: &mut Compiler<RiftScripting>, who: &'static Aim) -> Result<Eval, String> {
    cx.actor(who.as_ref()).map_err(bad)
}

pub fn aimed(world: &World, cx: &FlowCx, who: &Eval) -> Option<Entity> {
    super::query::actor(world, cx, who)
}

pub fn aimed_character(world: &World, cx: &FlowCx, who: &Eval) -> Option<Entity> {
    super::query::character(world, cx, who)
}

pub fn refuse(world: &mut World, cx: &FlowCx, wired: Link, reason: impl Into<String>) {
    if wired.is_some() {
        return;
    }
    let Some(subject) = cx.subject else {
        return;
    };
    if !super::query::is_character(world, subject) {
        return;
    }
    notification::notify(
        world,
        subject,
        Notification::new(
            NotificationKind::error(world.resource::<crate::core::content::Content>()),
            LineText::plain(reason.into()),
        ),
    );
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlaySound {
    pub sfx: super::Fill<SfxId>,
    #[serde(rename = "for")]
    pub audience: Audience,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Arrow,
}

impl EffectDef<RiftScripting> for PlaySound {
    fn owners(&self) -> &'static [OwnerKind] {
        ANY_OWNER
    }
    fn needs_subject(&self) -> bool {
        self.audience == Audience::Subject
    }
    fn outputs(&'static self) -> Vec<(Name, Link)> {
        vec![("next", self.next.as_deref())]
    }
    fn pauses(&self) -> bool {
        false
    }
    fn compile(&'static self, cx: &mut Compiler<RiftScripting>) -> Result<EffectCall, String> {
        let sfx = cx.audio(&self.sfx).map_err(bad)?;
        let audience = self.audience;
        Ok(Box::new(move |world, cx| {
            notification::play_sound(world, cx.owner.entity(), cx.subject, sfx, audience);
            EffectStep::Output(0)
        }))
    }
    fn reach(&self, cx: &Compiler<RiftScripting>) -> Vec<Reach> {
        cx.peek_audio(&self.sfx)
            .map(Reach::Plays)
            .into_iter()
            .collect()
    }
}

#[derive(JsonSchema, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Audience {
    Everyone,
    Subject,
}

pub fn interface_sound(
    content: &crate::core::content::Content,
    sound: crate::systems::interface::InterfaceSound,
) -> SfxId {
    sound.id(content)
}

pub fn integer(
    cx: &mut Compiler<RiftScripting>,
    expr: Option<&'static Condition>,
    default: i64,
) -> Result<Eval, String> {
    match expr {
        Some(expr) => cx.expr(expr, ValueType::Integer).map_err(bad),
        None => Ok(Box::new(move |_, _| {
            crate::core::script::Value::Int(default)
        })),
    }
}

pub fn number(cx: &mut Compiler<RiftScripting>, expr: &'static Condition) -> Result<Eval, String> {
    cx.expr(expr, ValueType::Number).map_err(bad)
}
