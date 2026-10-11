use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use strum::VariantArray;

use crate::core::assets::AssetRef;
use crate::core::content::{ContentId, ContentRow, ModuleRule, ModuleSet, RowCheck};
use crate::core::math::Size;
use crate::core::tiling::Tiles;

pub type Id = ContentId<ModelDef>;

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelDef {
    pub hitbox: HitboxSize,
    pub sprites: Sprites,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modules: Vec<ModelModule>,
}

impl ContentRow for ModelDef {
    const TABLE: &'static str = "model";

    fn check(&self, cx: &mut RowCheck) {
        cx.range("/hitbox/width", self.hitbox.width, 0.1, 8.0, "tiles");
        cx.range("/hitbox/height", self.hitbox.height, 0.1, 8.0, "tiles");
        let sheet = self.sheet();
        cx.range(
            "/sprites/frame_size/width",
            sheet.frame_size.width,
            1,
            8192,
            "pixels",
        );
        cx.range(
            "/sprites/frame_size/height",
            sheet.frame_size.height,
            1,
            8192,
            "pixels",
        );
        for (index, module) in self.modules.iter().enumerate() {
            if let ModelModule::Scale { factor } = module {
                cx.range(
                    format!("/modules/{index}/factor"),
                    *factor,
                    0.1,
                    10.0,
                    "a scale",
                );
            }
        }
    }
}

impl ActionName {
    pub fn key(self) -> &'static str {
        match self {
            ActionName::Idle => "idle",
            ActionName::Walk => "walk",
            ActionName::Run => "run",
            ActionName::Attack => "attack",
            ActionName::Death => "death",
        }
    }
}

impl DirectionName {
    pub fn key(self) -> &'static str {
        match self {
            DirectionName::S => "s",
            DirectionName::Sw => "sw",
            DirectionName::Nw => "nw",
            DirectionName::N => "n",
            DirectionName::Ne => "ne",
            DirectionName::Se => "se",
            DirectionName::E => "e",
            DirectionName::W => "w",
        }
    }
}

impl ModuleSet for ModelDef {
    type Module = ModelModule;

    fn modules(&self) -> &[ModelModule] {
        &self.modules
    }

    fn rule(_: &ModelModule) -> ModuleRule {
        ModuleRule::AtMostOne
    }
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HitboxSize {
    pub width: f32,
    pub height: f32,
}

impl HitboxSize {
    pub fn tiles(self) -> Size<Tiles> {
        Size::new(self.width, self.height)
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Sprites {
    Sheet(Sheet),
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Sheet {
    pub image: AssetRef,
    pub frame_size: FrameSize,
    pub actions: std::collections::BTreeMap<
        ActionName,
        std::collections::BTreeMap<DirectionName, Vec<Frame>>,
    >,
}

#[derive(JsonSchema, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FrameSize {
    pub width: u32,
    pub height: u32,
}

#[derive(
    JsonSchema,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    VariantArray,
)]
#[serde(rename_all = "snake_case")]
pub enum ActionName {
    Idle,
    Walk,
    Run,
    Attack,
    Death,
}

#[derive(
    JsonSchema,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    VariantArray,
)]
#[serde(rename_all = "snake_case")]
pub enum DirectionName {
    S,
    Sw,
    Nw,
    N,
    Ne,
    Se,
    E,
    W,
}

#[derive(JsonSchema, Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Frame {
    pub frame: u32,
    pub ms: u32,
    #[serde(
        default,
        skip_serializing_if = "crate::core::content::serial::is_false"
    )]
    pub step: bool,
    #[serde(
        default,
        skip_serializing_if = "crate::core::content::serial::is_false"
    )]
    pub apex: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sound: Option<crate::core::audio::playback::SfxId>,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ModelModule {
    Bust(Busts),
    Scale { factor: f32 },
    Airborne,
}

impl ModelDef {
    pub fn busts(&self) -> Option<&Busts> {
        self.modules.iter().find_map(|module| match module {
            ModelModule::Bust(busts) => Some(busts),
            _ => None,
        })
    }

    pub fn scale(&self) -> f32 {
        self.modules
            .iter()
            .find_map(|module| match module {
                ModelModule::Scale { factor } => Some(*factor),
                _ => None,
            })
            .unwrap_or(1.0)
    }

    pub fn airborne(&self) -> bool {
        self.modules
            .iter()
            .any(|module| matches!(module, ModelModule::Airborne))
    }

    pub fn sheet(&self) -> &Sheet {
        match &self.sprites {
            Sprites::Sheet(sheet) => sheet,
        }
    }
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct Busts {
    #[serde(flatten)]
    pub generic: GenericBusts,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub own: Vec<OwnBust>,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OwnBust {
    pub name: String,
    pub file: AssetRef,
}

#[derive(JsonSchema, Clone, Serialize, Deserialize)]
pub struct GenericBusts {
    pub neutral: AssetRef,
    pub happy: AssetRef,
    pub sad: AssetRef,
    pub angry: AssetRef,
    pub surprised: AssetRef,
    pub thinking: AssetRef,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Face {
    Generic(GenericExpression),
    Own(String),
}

impl Serialize for Face {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Face::Generic(expression) => serializer.serialize_str(expression.key()),
            Face::Own(name) => serializer.serialize_str(name),
        }
    }
}

impl JsonSchema for Face {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("Face")
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        String::json_schema(generator)
    }

    fn inline_schema() -> bool {
        true
    }
}

impl<'de> Deserialize<'de> for Face {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Face, D::Error> {
        let name = String::deserialize(deserializer)?;
        Ok(
            match GenericExpression::VARIANTS
                .iter()
                .find(|expression| expression.key() == name)
            {
                Some(expression) => Face::Generic(*expression),
                None => Face::Own(name),
            },
        )
    }
}

#[derive(
    JsonSchema,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    Debug,
    Default,
    PartialEq,
    Eq,
    Hash,
    VariantArray,
)]
#[serde(rename_all = "snake_case")]
pub enum GenericExpression {
    #[default]
    Neutral,
    Happy,
    Sad,
    Angry,
    Surprised,
    Thinking,
}

impl GenericExpression {
    pub fn key(self) -> &'static str {
        match self {
            GenericExpression::Neutral => "neutral",
            GenericExpression::Happy => "happy",
            GenericExpression::Sad => "sad",
            GenericExpression::Angry => "angry",
            GenericExpression::Surprised => "surprised",
            GenericExpression::Thinking => "thinking",
        }
    }
}

impl Busts {
    pub fn all(&self) -> impl Iterator<Item = &AssetRef> {
        GenericExpression::VARIANTS
            .iter()
            .map(|&expression| self.generic.of(expression))
            .chain(self.own.iter().map(|own| &own.file))
    }

    pub fn face(&self, face: &Face) -> Option<&AssetRef> {
        match face {
            Face::Generic(expression) => Some(self.generic.of(*expression)),
            Face::Own(name) => self
                .own
                .iter()
                .find(|own| own.name == *name)
                .map(|own| &own.file),
        }
    }
}

impl GenericBusts {
    pub fn of(&self, expression: GenericExpression) -> &AssetRef {
        match expression {
            GenericExpression::Neutral => &self.neutral,
            GenericExpression::Happy => &self.happy,
            GenericExpression::Sad => &self.sad,
            GenericExpression::Angry => &self.angry,
            GenericExpression::Surprised => &self.surprised,
            GenericExpression::Thinking => &self.thinking,
        }
    }
}
