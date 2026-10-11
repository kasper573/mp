use std::collections::BTreeMap;
use std::path::Path;

use game::core::assets::AssetService;
use game::core::audio::playback::SfxDef;
use game::core::content::{Content, key_of};
use game::systems::actor::bust::ModelModule;
use serde::Serialize;
use tiled::PropertyValue;

const DIRECTIONS: [&str; 8] = ["s", "sw", "nw", "n", "ne", "se", "e", "w"];
const ACTIONS: [&str; 5] = ["idle", "walk", "run", "attack", "death"];

#[derive(Serialize)]
pub struct ModelRow {
    pub hitbox: Hitbox,
    pub sprites: Sprites,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub modules: Vec<ModelPart>,
}

#[derive(Serialize, Clone)]
#[serde(untagged)]
pub enum ModelPart {
    Def(ModelModule),
    Extra(ExtraModule),
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ExtraModule {
    Scale { factor: f32 },
    Airborne,
}

#[derive(Serialize)]
pub struct Hitbox {
    pub width: f32,
    pub height: f32,
}

#[derive(Serialize)]
pub struct Sprites {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub image: String,
    pub frame_size: FrameSize,
    pub actions: BTreeMap<&'static str, BTreeMap<&'static str, Vec<FrameRow>>>,
}

#[derive(Serialize)]
pub struct FrameSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Clone)]
pub struct FrameRow {
    pub frame: u32,
    pub ms: u32,
    #[serde(skip_serializing_if = "is_false")]
    pub step: bool,
    #[serde(skip_serializing_if = "is_false")]
    pub apex: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sound: Option<String>,
}

fn is_false(flag: &bool) -> bool {
    !*flag
}

pub fn convert(
    assets: &AssetService,
    content: &Content,
    sheet: &str,
    modules_of: &[ModelModule],
) -> ModelRow {
    let tileset = tiled::Loader::with_reader(|path: &Path| assets.open(path))
        .load_tsx_tileset(sheet)
        .unwrap_or_else(|error| panic!("model {sheet}: {error}"));
    let image = tileset
        .image
        .as_ref()
        .and_then(|image| image.source.file_name())
        .and_then(|name| name.to_str())
        .unwrap_or_else(|| panic!("model {sheet} has no image"));
    let property = |key: &str| match tileset.properties.get(key) {
        Some(PropertyValue::FloatValue(value)) => Some(*value),
        Some(PropertyValue::IntValue(value)) => Some(*value as f32),
        _ => None,
    };
    let mut actions: BTreeMap<&'static str, BTreeMap<&'static str, Vec<FrameRow>>> =
        BTreeMap::new();
    for (id, tile) in tileset.tiles() {
        let Some(PropertyValue::StringValue(action)) = tile.properties.get("action") else {
            continue;
        };
        let action = ACTIONS
            .iter()
            .copied()
            .find(|name| name == action)
            .unwrap_or_else(|| panic!("model {sheet}: tile {id} has an unknown action {action}"));
        let direction = match tile.properties.get("dir") {
            Some(PropertyValue::IntValue(dir)) if (0..8).contains(dir) => DIRECTIONS[*dir as usize],
            _ => panic!("model {sheet}: tile {id} needs a dir in 0..8"),
        };
        let frames = tile
            .animation
            .as_ref()
            .unwrap_or_else(|| panic!("model {sheet}: tile {id} has no animation"));
        let mut strip: Vec<FrameRow> = frames
            .iter()
            .map(|frame| {
                let cues = tileset.get_tile(frame.tile_id);
                let flag = |name: &str| {
                    cues.as_ref().is_some_and(|tile| {
                        tile.properties.get(name) == Some(&PropertyValue::BoolValue(true))
                    })
                };
                let sound = cues
                    .as_ref()
                    .and_then(|tile| match tile.properties.get("sfx") {
                        Some(PropertyValue::StringValue(sfx)) => {
                            let key = key_of(sfx);
                            content
                                .by_key::<SfxDef>(key.as_str())
                                .unwrap_or_else(|| panic!("model {sheet}: sfx {sfx} is unknown"));
                            Some(key.as_str().to_owned())
                        }
                        _ => None,
                    });
                FrameRow {
                    frame: frame.tile_id,
                    ms: frame.duration,
                    step: flag("step"),
                    apex: flag("apex"),
                    sound,
                }
            })
            .collect();
        if let Some(last) = strip.iter().rposition(|frame| frame.apex) {
            for (index, frame) in strip.iter_mut().enumerate() {
                frame.apex = index == last;
            }
        }
        actions.entry(action).or_default().insert(direction, strip);
    }
    for action in ACTIONS {
        let strips = actions
            .get(action)
            .unwrap_or_else(|| panic!("model {sheet}: no {action} action"));
        for direction in DIRECTIONS {
            assert!(
                strips.contains_key(direction),
                "model {sheet}: {action} has no {direction} strip"
            );
        }
    }
    let mut modules: Vec<ModelPart> = Vec::new();
    if let Some(factor) = property("scale") {
        modules.push(ModelPart::Extra(ExtraModule::Scale { factor }));
    }
    if tileset.properties.get("airborne") == Some(&PropertyValue::BoolValue(true)) {
        modules.push(ModelPart::Extra(ExtraModule::Airborne));
    }
    modules.extend(modules_of.iter().cloned().map(ModelPart::Def));
    ModelRow {
        hitbox: Hitbox {
            width: property("hitbox_width").unwrap_or_else(|| panic!("model {sheet}: no hitbox")),
            height: property("hitbox_height").unwrap_or_else(|| panic!("model {sheet}: no hitbox")),
        },
        sprites: Sprites {
            kind: "sheet",
            image: format!("models/{image}"),
            frame_size: FrameSize {
                width: tileset.tile_width,
                height: tileset.tile_height,
            },
            actions,
        },
        modules,
    }
}
