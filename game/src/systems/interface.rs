use bevy_ecs::world::World;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum::VariantArray;

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
    pub x: u16,
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
    Checked,
    Locked,
    Tracked,
    Timed,
    ObjectiveDefeat,
    ObjectiveTask,
    ObjectiveDecide,
    WalkTarget,
    Terminal,
}

impl Fixture for InterfaceIcon {
    type Row = InterfaceIconDef;
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct FontDef {
    pub file: AssetRef,
}

impl ContentRow for FontDef {
    const TABLE: &'static str = "font";
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, strum::IntoStaticStr, strum::VariantArray)]
pub enum FontFace {
    #[strum(serialize = "circular_400")]
    Circular400,
    #[strum(serialize = "circular_500")]
    Circular500,
    #[strum(serialize = "circular_700")]
    Circular700,
    #[strum(serialize = "lato_400")]
    Lato400,
    #[strum(serialize = "lato_400_italic")]
    Lato400Italic,
    #[strum(serialize = "lato_700")]
    Lato700,
    #[strum(serialize = "lato_700_italic")]
    Lato700Italic,
}

impl Fixture for FontFace {
    type Row = FontDef;
}

pub fn font_files(content: &Content) -> Vec<String> {
    FontFace::VARIANTS
        .iter()
        .map(|face| face.get(content).file.path())
        .collect()
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
