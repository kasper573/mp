use std::collections::HashMap;

use strum::VariantArray;

use crate::core::audio::playback::SfxId;
use crate::core::content::media::ImageSizes;
use crate::core::content::{Content, Loading, RowCheck};
use crate::core::math::{Direction, Pos, Rect, Size, WorldPx};
use crate::core::tiling::Tiles;
use crate::core::time::{Millis, PlaybackRate, Seconds};

use super::Action;
use super::bust::{ActionName, DirectionName, Frame, ModelDef};

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

pub fn get(content: &Content, model: super::bust::Id) -> &'static ActorModel {
    content
        .built::<Models>()
        .0
        .get(model.index())
        .and_then(Option::as_ref)
        .unwrap_or_else(|| panic!("model {} failed to load", model.key(content)))
}

pub struct ActorModel {
    def: &'static ModelDef,
    columns: u32,
    strips: HashMap<Action, [&'static [Frame]; 8]>,
}

impl ActorModel {
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
            let mut slots: [&'static [Frame]; 8] = [&[]; 8];
            for (slot, direction) in DirectionName::VARIANTS.iter().enumerate() {
                if let Some(strip) = directions.get(direction) {
                    slots[slot] = strip.as_slice();
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

    pub fn sfx_ids(&self) -> impl Iterator<Item = &SfxId> {
        self.strips
            .values()
            .flat_map(|dirs| dirs.iter().copied())
            .flatten()
            .filter_map(|frame| frame.sound.as_ref())
    }

    fn strip(&self, action: Action, dir: Direction) -> &'static [Frame] {
        self.strips
            .get(&action)
            .expect("checked at load: every actor model declares every action")[dir_slot(dir)]
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

fn dir_slot(dir: Direction) -> usize {
    dir as usize
}

fn rate(action: Action, attack_speed: PlaybackRate) -> PlaybackRate {
    if action == Action::Attack {
        attack_speed.at_least(0.01)
    } else {
        PlaybackRate(1.0)
    }
}

fn total_ms(strip: &[Frame]) -> Millis {
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
