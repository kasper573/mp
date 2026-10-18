use bevy_ecs::world::World;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::core::assets::AssetRef;
use crate::core::audio::playback::{PlaySfx, SfxDef, SfxPlace};
use crate::core::content::{Content, ContentRow, Fixture};

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct CursorDef {
    pub image: AssetRef,
    pub hotspot: Hotspot,
}

impl ContentRow for CursorDef {
    const TABLE: &'static str = "cursor";
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Hotspot {
    #[schemars(extend("x-unit" = "px"))]
    pub x: u16,
    #[schemars(extend("x-unit" = "px"))]
    pub y: u16,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, strum::IntoStaticStr, strum::VariantArray)]
#[strum(serialize_all = "snake_case")]
pub enum CursorShape {
    Default,
    Pointer,
    Grab,
    Grabbing,
    Resize,
    Walk,
    WalkHeld,
    Attack,
    PickUp,
    Talk,
    Use,
    Open,
    Read,
}

impl Fixture for CursorShape {
    type Row = CursorDef;
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct InterfaceIconDef {
    pub image: AssetRef,
}

impl ContentRow for InterfaceIconDef {
    const TABLE: &'static str = "interface_icon";
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, strum::IntoStaticStr, strum::VariantArray)]
#[strum(serialize_all = "snake_case")]
pub enum InterfaceIcon {
    Settings,
    Bag,
    Equipment,
    Stats,
    QuestLog,
    History,
    WalkTarget,
    Terminal,
    Skills,
}

impl Fixture for InterfaceIcon {
    type Row = InterfaceIconDef;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, strum::IntoStaticStr, strum::VariantArray)]
#[strum(serialize_all = "snake_case")]
pub enum InterfaceSound {
    UiOpen,
    UiClose,
    UiMove,
    UiPick,
    UiRefuse,
    UiChime,
    UiPage,
    Coins,
    QuestAccepted,
    QuestCompleted,
    QuestAbandoned,
    RisingChime,
    TallyTick,
}

impl Fixture for InterfaceSound {
    type Row = SfxDef;
}

impl InterfaceSound {
    pub fn play(self, world: &mut World) {
        let id = self.id(world.resource::<Content>());
        world.write_message(PlaySfx {
            id,
            place: SfxPlace::Interface,
        });
    }
}
