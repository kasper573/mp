mod paint;

pub use paint::{Hand, TextLook, TextShadow, measure, show, show_shadowed};

use std::borrow::Cow;
use std::collections::HashMap;
use std::time::Duration;

use bevy::prelude::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum::{IntoStaticStr, VariantArray};
use ui::egui::Color32;
use ui::ink::Prose;

const SLOW_PACE: f32 = 2.5;

#[derive(Component, Clone, Debug, Default, PartialEq)]
pub struct StyledLine {
    pub pieces: Vec<TextPiece>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TextPiece {
    Span(StyledSpan),
    Pause(Duration),
    Key(KeyCap),
}

/// A key drawn as a cap: an input named by its current binding, or a key named outright.
#[derive(Clone, Debug, PartialEq)]
pub enum KeyCap {
    Input(InputRef),
    Named(Cow<'static, str>),
}

impl KeyCap {
    pub fn name<'a>(&'a self, keys: &'a KeyNames) -> &'a str {
        match self {
            KeyCap::Input(input) => keys.name(*input),
            KeyCap::Named(name) => name,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct StyledSpan {
    pub text: Cow<'static, str>,
    pub ink: Option<SpanInk>,
    pub voice: Option<TextVoice>,
    pub motion: Option<TextMotion>,
    pub slow: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpanInk {
    Prose(Prose),
    Fixed(Color32),
}

#[derive(
    JsonSchema,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    IntoStaticStr,
    VariantArray,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum TextVoice {
    Whisper,
    Shout,
}

#[derive(
    JsonSchema,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    IntoStaticStr,
    VariantArray,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum TextMotion {
    Wave,
    Shake,
    Pulse,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct InputRef(pub u16);

#[derive(Resource, Clone, Debug, Default, PartialEq)]
pub struct KeyNames(pub HashMap<InputRef, String>);

impl KeyNames {
    pub fn name(&self, input: InputRef) -> &str {
        self.0.get(&input).map_or("", String::as_str)
    }
}

#[derive(Resource, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, PartialOrd)]
pub struct LettersPerSecond(pub f32);

impl LettersPerSecond {
    pub(crate) const SLOWEST: LettersPerSecond = LettersPerSecond(15.0);
    pub(crate) const FASTEST: LettersPerSecond = LettersPerSecond(120.0);

    pub(crate) fn clamped(self) -> LettersPerSecond {
        LettersPerSecond(self.0.clamp(Self::SLOWEST.0, Self::FASTEST.0))
    }
}

impl Default for LettersPerSecond {
    fn default() -> LettersPerSecond {
        LettersPerSecond(45.0)
    }
}

#[derive(Component, Clone, Debug, Default, PartialEq)]
pub struct Typewriter {
    elapsed: Duration,
    shown: usize,
    finished: bool,
}

#[derive(Message, Clone, Copy, Debug)]
pub struct TypewriterReveal {
    pub entity: Entity,
    pub index: usize,
}

impl Typewriter {
    pub fn finish(&mut self) {
        self.finished = true;
    }

    pub fn is_finished(&self) -> bool {
        self.finished
    }

    pub fn shown(&self) -> Option<usize> {
        (!self.finished).then_some(self.shown)
    }

    pub fn elapsed(&self) -> Duration {
        self.elapsed
    }
}

impl StyledLine {
    pub fn new(pieces: Vec<TextPiece>) -> StyledLine {
        StyledLine { pieces }
    }

    pub fn plain_text(text: impl Into<Cow<'static, str>>) -> StyledLine {
        StyledLine::new(vec![TextPiece::text(text)])
    }

    pub fn plain(&self, keys: &KeyNames) -> String {
        self.pieces
            .iter()
            .filter_map(|piece| match piece {
                TextPiece::Span(span) => Some(span.text.as_ref()),
                TextPiece::Pause(_) => None,
                TextPiece::Key(cap) => Some(cap.name(keys)),
            })
            .collect()
    }
}

impl TextPiece {
    pub fn text(text: impl Into<Cow<'static, str>>) -> TextPiece {
        TextPiece::Span(StyledSpan::plain(text))
    }

    pub fn key(name: impl Into<Cow<'static, str>>) -> TextPiece {
        TextPiece::Key(KeyCap::Named(name.into()))
    }
}

impl StyledSpan {
    pub fn plain(text: impl Into<Cow<'static, str>>) -> StyledSpan {
        StyledSpan {
            text: text.into(),
            ink: None,
            voice: None,
            motion: None,
            slow: false,
        }
    }

    pub fn ink(mut self, ink: Color32) -> StyledSpan {
        self.ink = Some(SpanInk::Fixed(ink));
        self
    }

    pub fn prose(mut self, prose: Prose) -> StyledSpan {
        self.ink = Some(SpanInk::Prose(prose));
        self
    }

    pub fn voice(mut self, voice: TextVoice) -> StyledSpan {
        self.voice = Some(voice);
        self
    }

    pub fn motion(mut self, motion: TextMotion) -> StyledSpan {
        self.motion = Some(motion);
        self
    }

    pub fn slow(mut self) -> StyledSpan {
        self.slow = true;
        self
    }
}

impl From<StyledSpan> for TextPiece {
    fn from(span: StyledSpan) -> TextPiece {
        TextPiece::Span(span)
    }
}

pub fn reveal_times(pieces: &[TextPiece], speed: LettersPerSecond) -> Vec<Duration> {
    let step = |pace: f32| Duration::from_secs_f64(f64::from(pace) / f64::from(speed.0));
    let mut clock = Duration::ZERO;
    let mut times = Vec::new();
    for piece in pieces {
        match piece {
            TextPiece::Pause(pause) => clock += *pause,
            TextPiece::Span(span) => {
                let pace = if span.slow { SLOW_PACE } else { 1.0 };
                for _ in span.text.chars() {
                    clock += step(pace);
                    times.push(clock);
                }
            }
            TextPiece::Key(_) => {
                clock += step(1.0);
                times.push(clock);
            }
        }
    }
    times
}

pub fn revealed(pieces: &[TextPiece], speed: LettersPerSecond, elapsed: Duration) -> usize {
    reveal_times(pieces, speed)
        .iter()
        .take_while(|time| **time <= elapsed)
        .count()
}

pub fn reveal_duration(pieces: &[TextPiece], speed: LettersPerSecond) -> Duration {
    reveal_times(pieces, speed)
        .last()
        .copied()
        .unwrap_or(Duration::ZERO)
}

pub struct StyledTextPlugin;

impl Plugin for StyledTextPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<KeyNames>()
            .init_resource::<LettersPerSecond>()
            .add_message::<TypewriterReveal>()
            .add_systems(Update, advance_typewriters);
    }
}

pub(crate) fn advance_typewriters(
    time: Res<Time>,
    speed: Res<LettersPerSecond>,
    mut lines: Query<(Entity, Ref<StyledLine>, &mut Typewriter)>,
    mut reveals: MessageWriter<TypewriterReveal>,
) {
    for (entity, line, mut typewriter) in &mut lines {
        if line.is_changed() && !line.is_added() {
            *typewriter = Typewriter::default();
        }
        let shown = if typewriter.finished {
            reveal_times(&line.pieces, *speed).len()
        } else {
            typewriter.elapsed += time.delta();
            if typewriter.elapsed >= reveal_duration(&line.pieces, *speed) {
                typewriter.finished = true;
            }
            revealed(&line.pieces, *speed, typewriter.elapsed)
        };
        if shown > typewriter.shown {
            let newly = typewriter.shown..shown;
            reveals.write_batch(newly.map(|index| TypewriterReveal { entity, index }));
            typewriter.shown = shown;
        }
    }
}
