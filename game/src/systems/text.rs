use std::borrow::Cow;
use std::time::Duration;

use bevy::color::Color;
use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::{Deserialize, Serialize, Serializer};
use strum::{IntoStaticStr, VariantArray};
use ui::tokens::palette;
use ui::{RichPiece, RichSpan, RichText, TextMotion, TextVoice};

use crate::core::script::{Expr, Value};
use crate::core::time::Millis;
use crate::systems::input::map::{self, InputAction, InputMap};
use crate::systems::script::RiftScripting;

#[derive(Clone)]
pub enum Span {
    Text {
        text: String,
        fx: Vec<Fx>,
    },
    Input(InputAction),
    Value {
        value: Box<Expr<RiftScripting>>,
        fx: Vec<Fx>,
    },
}

impl Serialize for Span {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let row = match self {
            Span::Text { text, fx } if fx.is_empty() => return serializer.serialize_str(text),
            Span::Text { text, fx } => StyledRow::styled(Some(text.clone()), None, None, fx),
            Span::Value { value, fx } => StyledRow::styled(None, Some((**value).clone()), None, fx),
            Span::Input(action) => StyledRow::styled(None, None, Some(*action), &[]),
        };
        row.serialize(serializer)
    }
}

impl JsonSchema for Span {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("Span")
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let mut schema = SpanRow::json_schema(generator);
        schema.insert("x-span".to_owned(), true.into());
        schema
    }

    fn inline_schema() -> bool {
        true
    }
}

impl<'de> Deserialize<'de> for Span {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Span, D::Error> {
        Ok(match SpanRow::deserialize(deserializer)? {
            SpanRow::Plain(text) => Span::Text {
                text,
                fx: Vec::new(),
            },
            SpanRow::Styled(styled) => {
                let mut fx = Vec::new();
                fx.extend(styled.ink.map(Fx::Ink));
                fx.extend(styled.voice.map(Fx::Voice));
                fx.extend(styled.motion.map(Fx::Motion));
                if styled.slow {
                    fx.push(Fx::Slow);
                }
                fx.extend(styled.pause_after.map(Fx::PauseAfter));
                match (styled.text, styled.value, styled.input) {
                    (Some(text), None, None) => Span::Text { text, fx },
                    (None, Some(value), None) => Span::Value {
                        value: Box::new(value),
                        fx,
                    },
                    (None, None, Some(input)) if fx.is_empty() => Span::Input(input),
                    _ => {
                        return Err(serde::de::Error::custom(
                            "a span is a string, { text }, { value } or { input }",
                        ));
                    }
                }
            }
        })
    }
}

#[derive(JsonSchema, Deserialize)]
#[serde(untagged)]
enum SpanRow {
    Plain(String),
    Styled(StyledRow),
}

#[derive(JsonSchema, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StyledRow {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    value: Option<Expr<RiftScripting>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    input: Option<InputAction>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    ink: Option<Ink>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    voice: Option<Voice>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    motion: Option<Motion>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    slow: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pause_after: Option<Millis>,
}

impl StyledRow {
    fn styled(
        text: Option<String>,
        value: Option<Expr<RiftScripting>>,
        input: Option<InputAction>,
        fx: &[Fx],
    ) -> StyledRow {
        let mut row = StyledRow {
            text,
            value,
            input,
            ink: None,
            voice: None,
            motion: None,
            slow: false,
            pause_after: None,
        };
        for fx in fx {
            match fx {
                Fx::Ink(ink) => row.ink = Some(*ink),
                Fx::Voice(voice) => row.voice = Some(*voice),
                Fx::Motion(motion) => row.motion = Some(*motion),
                Fx::Slow => row.slow = true,
                Fx::PauseAfter(millis) => row.pause_after = Some(*millis),
            }
        }
        row
    }
}

pub fn plain(text: impl Into<String>) -> Span {
    Span::Text {
        text: text.into(),
        fx: Vec::new(),
    }
}

pub fn values(spans: &'static [Span]) -> Vec<&'static Expr<RiftScripting>> {
    spans
        .iter()
        .filter_map(|span| match span {
            Span::Value { value, .. } => Some(&**value),
            Span::Text { .. } | Span::Input(_) => None,
        })
        .collect()
}

#[derive(JsonSchema, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum Fx {
    Ink(Ink),
    Voice(Voice),
    Motion(Motion),
    Slow,
    PauseAfter(Millis),
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
pub enum Ink {
    Danger,
    Item,
    Place,
    Name,
    Magic,
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
pub enum Voice {
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
pub enum Motion {
    Wave,
    Shake,
    Pulse,
}

#[derive(JsonSchema, Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct LineText(pub Vec<SpanText>);

#[derive(JsonSchema, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum SpanText {
    Text { text: String, fx: Vec<Fx> },
    Input(InputAction),
}

impl LineText {
    pub fn spoken(spans: &[Span], values: &[Value]) -> LineText {
        let mut values = values.iter();
        LineText(
            spans
                .iter()
                .map(|span| match span {
                    Span::Text { text, fx } => SpanText::Text {
                        text: text.clone(),
                        fx: fx.clone(),
                    },
                    Span::Value { fx, .. } => SpanText::Text {
                        text: values.next().map(Value::as_text).unwrap_or_default(),
                        fx: fx.clone(),
                    },
                    Span::Input(action) => SpanText::Input(*action),
                })
                .collect(),
        )
    }

    pub fn of(spans: &[Span]) -> LineText {
        LineText::spoken(spans, &[])
    }

    pub fn plain(text: impl Into<String>) -> LineText {
        LineText(vec![SpanText::Text {
            text: text.into(),
            fx: Vec::new(),
        }])
    }

    pub fn words(&self, inputs: &InputMap) -> String {
        self.0
            .iter()
            .map(|span| match span {
                SpanText::Text { text, .. } => text.clone(),
                SpanText::Input(action) => inputs.name(*action).unwrap_or_default(),
            })
            .collect()
    }

    pub fn word_count(&self) -> usize {
        self.0
            .iter()
            .map(|span| match span {
                SpanText::Text { text, .. } => text.split_whitespace().count(),
                SpanText::Input(_) => 1,
            })
            .sum()
    }

    pub fn rich(&self) -> RichText {
        RichText::new(self.0.iter().flat_map(SpanText::pieces).collect())
    }
}

impl SpanText {
    fn pieces(&self) -> Vec<RichPiece> {
        let (text, fx) = match self {
            SpanText::Text { text, fx } => (text, fx),
            SpanText::Input(action) => return vec![map::input(*action)],
        };
        let mut span = RichSpan::plain(text.clone());
        let mut pause = None;
        for fx in fx {
            match *fx {
                Fx::Ink(ink) => span = span.color(ink.color()),
                Fx::Voice(Voice::Whisper) => span = span.voice(TextVoice::Whisper),
                Fx::Voice(Voice::Shout) => span = span.voice(TextVoice::Shout),
                Fx::Motion(motion) => span = span.motion(motion.text_motion()),
                Fx::Slow => span = span.slow(),
                Fx::PauseAfter(wait) => {
                    pause = Some(RichPiece::Pause(Duration::from_secs_f32(wait.seconds().0)));
                }
            }
        }
        std::iter::once(span.into()).chain(pause).collect()
    }
}

impl Motion {
    pub fn text_motion(self) -> TextMotion {
        match self {
            Motion::Wave => TextMotion::Wave,
            Motion::Shake => TextMotion::Shake,
            Motion::Pulse => TextMotion::Pulse,
        }
    }
}

impl Ink {
    pub fn color(self) -> Color {
        match self {
            Ink::Danger => palette::CRIMSON_80,
            Ink::Item => palette::AMBER_80,
            Ink::Place => palette::AZURE_80,
            Ink::Name => palette::EMERALD_80,
            Ink::Magic => palette::VIOLET_80,
        }
    }
}
