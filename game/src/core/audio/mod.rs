pub mod loader;
pub mod mix;
pub mod playback;
pub mod soundscape;

use bevy_kira_audio::prelude::Decibels;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(JsonSchema, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, PartialOrd)]
#[serde(transparent)]
#[schemars(extend("x-unit" = "LUFS"))]
pub struct Lufs(pub f64);

pub fn decibels(amplitude: f32) -> Decibels {
    Decibels(20.0 * amplitude.max(1e-4).log10())
}
