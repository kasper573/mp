use std::borrow::Cow;
use std::collections::{BTreeMap, HashMap};

use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::{Deserialize, Serialize};
use strum::{EnumString, VariantArray};

use super::Action;
use crate::core::assets::AssetRef;
use crate::core::audio::playback::SfxId;
use crate::core::content::media::ImageSizes;
use crate::core::content::{
    Content, ContentId, ContentRow, Loading, ModuleRule, ModuleSet, RowCheck, serial,
};
use crate::core::math::{Direction, Pos, Rect, Size, WorldPx};
use crate::core::tiling::Tiles;
use crate::core::time::{Millis, PlaybackRate, Seconds};

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
    pub fn of(dir: Direction) -> DirectionName {
        match dir {
            Direction::S => DirectionName::S,
            Direction::SW => DirectionName::Sw,
            Direction::NW => DirectionName::Nw,
            Direction::N => DirectionName::N,
            Direction::NE => DirectionName::Ne,
            Direction::SE => DirectionName::Se,
            Direction::E => DirectionName::E,
            Direction::W => DirectionName::W,
        }
    }

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
    pub actions: BTreeMap<ActionName, BTreeMap<DirectionName, Vec<SheetFrame>>>,
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
    EnumString,
    Default,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum ActionName {
    #[default]
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
    EnumString,
    Default,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum DirectionName {
    #[default]
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
pub struct SheetFrame {
    pub frame: u32,
    pub ms: u32,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    pub step: bool,
    #[serde(default, skip_serializing_if = "serial::is_false")]
    pub apex: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sound: Option<SfxId>,
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
        let mut schema = String::json_schema(generator);
        schema.insert("x-face".to_owned(), true.into());
        schema
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

pub const MAX_STRIP_FRAMES: usize = 256;
pub const MAX_FRAME_MS: u32 = 60_000;

pub struct Models(pub Vec<Option<ActorModel>>);

pub fn build_all(loading: &mut Loading) {
    let content = loading.content();
    let sizes = content.built::<ImageSizes>();
    let mut models: Vec<Option<ActorModel>> = content.ids::<ModelDef>().map(|_| None).collect();
    for (id, def) in loading.rows::<ModelDef>() {
        let mut check = RowCheck::default();
        let sheet = def.sheet();
        let image = sizes.0.get(sheet.image.as_str()).copied();
        if let Some((width, height)) = image
            && (width % sheet.frame_size.width.max(1) != 0
                || height % sheet.frame_size.height.max(1) != 0)
        {
            check.error(
                "/sprites/image",
                "image size",
                format!(
                    "{width} × {height}, not a multiple of {} × {}",
                    sheet.frame_size.width, sheet.frame_size.height
                ),
                "an image of whole frames",
            );
        }
        let frames = image.map(|(width, height)| {
            (width / sheet.frame_size.width.max(1)) * (height / sheet.frame_size.height.max(1))
        });
        for action in ActionName::VARIANTS {
            let Some(strips) = sheet.actions.get(action) else {
                check.error(
                    "/sprites/actions",
                    "missing frames",
                    format!("no {} action", action.key()),
                    "every action: idle, walk, run, attack, death",
                );
                continue;
            };
            for direction in DirectionName::VARIANTS {
                let pointer = format!("/sprites/actions/{}/{}", action.key(), direction.key());
                let Some(strip) = strips.get(direction) else {
                    check.error(
                        format!("/sprites/actions/{}", action.key()),
                        "missing frames",
                        format!("direction {} has no frames", direction.key()),
                        "1 to 256 frames in each of s, sw, nw, n, ne, se, e, w",
                    );
                    continue;
                };
                check.count(&pointer, strip.len(), 1, MAX_STRIP_FRAMES, "frames");
                let mut apexes = Vec::new();
                for (index, frame) in strip.iter().enumerate() {
                    check.range(
                        format!("{pointer}/{index}/ms"),
                        frame.ms,
                        1,
                        MAX_FRAME_MS,
                        "whole milliseconds",
                    );
                    if let Some(frames) = frames
                        && frame.frame >= frames
                    {
                        check.error(
                            format!("{pointer}/{index}/frame"),
                            "tile out of range",
                            format!("frame {} of {frames}", frame.frame),
                            format!("0 to {}", frames.saturating_sub(1)),
                        );
                    }
                    if frame.apex {
                        apexes.push(index);
                    }
                }
                if (apexes.len() > 1) || (!apexes.is_empty() && *action != ActionName::Attack) {
                    check.error(
                        &pointer,
                        "apex out of place",
                        format!(
                            "{} · {}: frames {}",
                            action.key(),
                            direction.key(),
                            apexes
                                .iter()
                                .map(|i| i.to_string())
                                .collect::<Vec<_>>()
                                .join(" and ")
                        ),
                        "one apex, in attack strips only",
                    );
                }
            }
        }
        if let Some(busts) = def.busts() {
            let mut size: Option<(u32, u32, &str)> = None;
            for bust in busts.all() {
                let Some(&own) = sizes.0.get(bust.as_str()) else {
                    continue;
                };
                match size {
                    None => size = Some((own.0, own.1, bust.as_str())),
                    Some((w, h, first)) if (w, h) != own => {
                        check.error(
                            "/modules",
                            "bust sizes differ",
                            format!(
                                "{} is {} × {}, {first} is {w} × {h}",
                                bust.as_str(),
                                own.0,
                                own.1
                            ),
                            "every bust of one model at one size",
                        );
                        break;
                    }
                    Some(_) => {}
                }
            }
        }
        if check.is_empty() {
            models[id.index()] = Some(ActorModel::new(def, image));
        } else {
            loading.row_errors(id, check);
            loading.fail(id);
        }
    }
    loading.built(Models(models));
}

pub struct ActorModel {
    def: &'static ModelDef,
    columns: u32,
    strips: HashMap<Action, [&'static [SheetFrame]; 8]>,
}

impl ActorModel {
    pub fn get(content: &Content, model: Id) -> &'static ActorModel {
        content
            .built::<Models>()
            .0
            .get(model.index())
            .and_then(Option::as_ref)
            .unwrap_or_else(|| panic!("model {} failed to load", model.key(content)))
    }

    fn new(def: &'static ModelDef, image: Option<(u32, u32)>) -> ActorModel {
        let sheet = def.sheet();
        let columns = image
            .map_or(1, |(width, _)| width / sheet.frame_size.width.max(1))
            .max(1);
        let mut strips = HashMap::new();
        for action in Action::ALL {
            let name = action_name(action);
            let Some(directions) = sheet.actions.get(&name) else {
                continue;
            };
            let mut slots: [&'static [SheetFrame]; 8] = [&[]; 8];
            for direction in DirectionName::VARIANTS {
                if let Some(strip) = directions.get(direction) {
                    slots[*direction as usize] = strip.as_slice();
                }
            }
            strips.insert(action, slots);
        }
        ActorModel {
            def,
            columns,
            strips,
        }
    }

    pub fn hitbox(&self) -> Size<Tiles> {
        self.def.hitbox.tiles()
    }

    pub fn sheet(&self) -> &'static crate::core::assets::AssetRef {
        &self.def.sheet().image
    }

    pub fn airborne(&self) -> bool {
        self.def.airborne()
    }

    pub fn drawn_size(&self, frame: Rect<WorldPx>) -> Size<WorldPx> {
        frame.size * self.def.scale()
    }

    pub fn frame(
        &self,
        action: Action,
        dir: Direction,
        t: Seconds,
        attack_speed: PlaybackRate,
    ) -> Rect<WorldPx> {
        let strip = self.strip(action, dir);
        let elapsed = (t.millis() * rate(action, attack_speed)).max(Millis(0.0));
        let total = total_ms(strip);
        let position = if action == Action::Dead {
            elapsed.min(total - Millis(1.0))
        } else {
            elapsed % total
        };
        let mut cursor = Millis(0.0);
        for frame in strip {
            cursor += Millis(frame.ms as f32);
            if position < cursor {
                return self.region(frame.frame);
            }
        }
        self.region(strip[strip.len() - 1].frame)
    }

    pub fn timing(&self, action: Action, dir: Direction) -> Timing {
        let strip = self.strip(action, dir);
        let mut apex = Millis(0.0);
        let mut cursor = Millis(0.0);
        for frame in strip {
            if frame.apex {
                apex = cursor;
            }
            cursor += Millis(frame.ms as f32);
        }
        Timing {
            duration: cursor.seconds(),
            apex: apex.seconds(),
        }
    }

    /// `prev` is the playback position at the previous sample, or `None` when the action just
    /// started, in which case every cue up to `now` fires.
    pub fn cues(
        &self,
        action: Action,
        dir: Direction,
        prev: Option<Seconds>,
        now: Seconds,
        attack_speed: PlaybackRate,
    ) -> (Vec<&SfxId>, bool) {
        let strip = self.strip(action, dir);
        let rate = rate(action, attack_speed);
        let authored = |t: Seconds| t.millis() * rate;
        let total = total_ms(strip);
        let once = action == Action::Dead;
        let (mut sfx, mut stepped) = (Vec::new(), false);
        let mut cursor = Millis(0.0);
        for frame in strip {
            if crossed(once, total, cursor, prev.map(authored), authored(now)) {
                sfx.extend(frame.sound.as_ref());
                stepped |= frame.step;
            }
            cursor += Millis(frame.ms as f32);
        }
        (sfx, stepped)
    }

    fn strip(&self, action: Action, dir: Direction) -> &'static [SheetFrame] {
        self.strips
            .get(&action)
            .expect("checked at load: every actor model declares every action")
            [DirectionName::of(dir) as usize]
    }

    fn region(&self, frame: u32) -> Rect<WorldPx> {
        let size = self.def.sheet().frame_size;
        let frame_size = Size::new(size.width as f32, size.height as f32);
        Rect::new(
            Pos::new(
                (frame % self.columns) as f32 * frame_size.width,
                (frame / self.columns) as f32 * frame_size.height,
            ),
            frame_size,
        )
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Timing {
    pub duration: Seconds,
    pub apex: Seconds,
}

fn action_name(action: Action) -> ActionName {
    match action {
        Action::Idle => ActionName::Idle,
        Action::Walk => ActionName::Walk,
        Action::Run => ActionName::Run,
        Action::Attack => ActionName::Attack,
        Action::Dead => ActionName::Death,
    }
}

fn rate(action: Action, attack_speed: PlaybackRate) -> PlaybackRate {
    if action == Action::Attack {
        attack_speed.at_least(0.01)
    } else {
        PlaybackRate(1.0)
    }
}

fn total_ms(strip: &[SheetFrame]) -> Millis {
    Millis(strip.iter().map(|frame| frame.ms as f32).sum())
}

fn crossed(once: bool, total: Millis, at: Millis, prev: Option<Millis>, now: Millis) -> bool {
    let count = |t: Millis| {
        if t < at {
            0
        } else if once {
            1
        } else {
            (t - at).ratio(total) as i64 + 1
        }
    };
    count(now) > prev.map_or(0, count)
}
