mod paint;

use std::borrow::Cow;
use std::collections::HashMap;
use std::time::Duration;

use bevy::prelude::*;
use design_tokens::ink::Prose;
use egui::Color32;

pub use paint::{Hand, TextLook, TextShadow, measure, show, show_shadowed};

const SLOW_PACE: f32 = 2.5;

#[derive(Component, Clone, Debug, Default, PartialEq)]
pub struct StyledLine {
    pub pieces: Vec<TextPiece>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TextPiece {
    Span(StyledSpan),
    Pause(Duration),
    Key(InputRef),
}

#[derive(Clone, Debug, PartialEq)]
pub struct StyledSpan {
    pub text: Cow<'static, str>,
    pub ink: Option<SpanInk>,
    pub voice: TextVoice,
    pub motion: Option<TextMotion>,
    pub slow: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpanInk {
    Prose(Prose),
    Fixed(Color32),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum TextVoice {
    #[default]
    Normal,
    Whisper,
    Shout,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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

#[derive(Resource, Clone, Copy, Debug, PartialEq)]
pub struct TypewriterSpeed(pub Option<f32>);

impl Default for TypewriterSpeed {
    fn default() -> TypewriterSpeed {
        TypewriterSpeed(Some(45.0))
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
                TextPiece::Key(input) => Some(keys.name(*input)),
            })
            .collect()
    }
}

impl TextPiece {
    pub fn text(text: impl Into<Cow<'static, str>>) -> TextPiece {
        TextPiece::Span(StyledSpan::plain(text))
    }
}

impl StyledSpan {
    pub fn plain(text: impl Into<Cow<'static, str>>) -> StyledSpan {
        StyledSpan {
            text: text.into(),
            ink: None,
            voice: TextVoice::Normal,
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
        self.voice = voice;
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

pub fn reveal_times(pieces: &[TextPiece], speed: TypewriterSpeed) -> Vec<Duration> {
    let Some(per_second) = speed.0.filter(|rate| *rate > 0.0) else {
        return pieces
            .iter()
            .flat_map(|piece| match piece {
                TextPiece::Span(span) => vec![Duration::ZERO; span.text.chars().count()],
                TextPiece::Pause(_) => Vec::new(),
                TextPiece::Key(_) => vec![Duration::ZERO],
            })
            .collect();
    };
    let step = |pace: f32| {
        Duration::from_nanos((f64::from(pace) / f64::from(per_second) * 1e9).round() as u64)
    };
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

pub fn revealed(pieces: &[TextPiece], speed: TypewriterSpeed, elapsed: Duration) -> usize {
    reveal_times(pieces, speed)
        .iter()
        .take_while(|time| **time <= elapsed)
        .count()
}

pub fn reveal_duration(pieces: &[TextPiece], speed: TypewriterSpeed) -> Duration {
    reveal_times(pieces, speed)
        .last()
        .copied()
        .unwrap_or(Duration::ZERO)
}

pub struct TextPlugin;

impl Plugin for TextPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<KeyNames>()
            .init_resource::<TypewriterSpeed>()
            .add_message::<TypewriterReveal>()
            .add_systems(Update, advance_typewriters);
    }
}

pub(crate) fn advance_typewriters(
    time: Res<Time>,
    speed: Res<TypewriterSpeed>,
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
