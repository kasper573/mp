use std::collections::BTreeMap;
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::core::content::version;
use crate::core::net::auth::{RealmAccess, TokenClaims};
use crate::core::render::present::MaxFps;
use crate::core::time::UtcHour;
use crate::systems::account::Role;
use crate::systems::player::SpawnPolicy;
use crate::systems::script::Place;
use crate::systems::settings;

pub const BUILD_INFO_FLAG: &str = "--build-info";
pub const SERVER_ENV_PREFIX: &str = "RIFT_GAME_SERVER_";
pub const CLIENT_ENV_PREFIX: &str = "RIFT_CLIENT_";
pub const TEST_CHARACTER_ROUTE: &str = "/test/character";

/// What a server on fake auth takes as an account's sign-in.
pub fn fake_token(account: &str, roles: &[Role]) -> String {
    TokenClaims {
        sub: account.to_owned(),
        azp: None,
        preferred_username: Some(account.to_owned()),
        realm_access: RealmAccess {
            roles: roles.iter().map(|role| role.as_ref().to_owned()).collect(),
        },
    }
    .unsigned()
}

#[derive(Clone, Serialize, Deserialize)]
pub struct BuildInfo {
    pub build: String,
    pub content_version: String,
}

impl BuildInfo {
    pub fn current() -> BuildInfo {
        BuildInfo {
            build: version::build().to_owned(),
            content_version: super::registry().version().0.clone(),
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct ReadyLine {
    pub ready: ServerReady,
}

#[derive(Serialize, Deserialize)]
pub struct ServerReady {
    pub build: String,
    pub content_version: String,
    pub http: u16,
    pub ws: u16,
}

#[derive(Serialize, Deserialize)]
pub struct TestCharacterRequest {
    pub test_character: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<Place>,
}

#[derive(Serialize, Deserialize)]
pub struct ServerConfig {
    pub bind: IpAddr,
    pub port: u16,
    pub ws_port: u16,
    pub max_clients: usize,
    pub areas: ServedAreas,
    pub content_dir: PathBuf,
    pub player_spawn_type: SpawnPolicy,
    pub player_immortal: bool,
    pub rng_seed: Option<u64>,
    pub daily_reset_utc_hour: UtcHour,
    pub auth: AuthMode,
    pub test_characters: Switch,
    pub exit_on_stdin_eof: bool,
    pub pyroscope_enabled: bool,
    pub pyroscope_sample_hz: u32,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthMode {
    Oidc,
    Fake,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Switch {
    On,
    Off,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ServedAreas {
    Real,
    Bench(usize),
}

impl Serialize for ServedAreas {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            ServedAreas::Real => serializer.serialize_str("real"),
            ServedAreas::Bench(count) => serializer.serialize_str(&format!("bench,{count}")),
        }
    }
}

impl<'de> Deserialize<'de> for ServedAreas {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<ServedAreas, D::Error> {
        let spec = String::deserialize(deserializer)?;
        if spec == "real" {
            return Ok(ServedAreas::Real);
        }
        if let Some(count) = spec.strip_prefix("bench,") {
            return count
                .parse()
                .map(ServedAreas::Bench)
                .map_err(serde::de::Error::custom);
        }
        Err(serde::de::Error::custom(format!(
            "expected `real` or `bench,<n>`, got `{spec}`"
        )))
    }
}

#[derive(Serialize, Deserialize)]
pub struct ClientConfig {
    pub game_server_url: String,
    pub game_server_ws_url: String,
    pub access_token: String,
    pub profile_dir: PathBuf,
    pub exit_on_stdin_eof: bool,
    pub probe: Option<SocketAddr>,
}

/// What a desktop client keeps in its profile between runs, by key.
pub fn profile_settings(profile: &Path) -> BTreeMap<String, String> {
    std::fs::read_to_string(profile.join(PROFILE_SETTINGS))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save_profile_settings(
    profile: &Path,
    settings: &BTreeMap<String, String>,
) -> std::io::Result<()> {
    let text = serde_json::to_string_pretty(settings).expect("settings serialize");
    std::fs::create_dir_all(profile)?;
    std::fs::write(profile.join(PROFILE_SETTINGS), text)
}

/// Starts a desktop client's profile with frames coming at `max_fps`, as a player who picked it in
/// the settings would have left it.
pub fn seed_max_fps(profile: &Path, max_fps: MaxFps) {
    let mut stored = profile_settings(profile);
    settings::seed_max_fps(&mut stored, max_fps);
    save_profile_settings(profile, &stored).expect("the profile's settings written");
}

pub fn env_of<T: Serialize>(prefix: &str, config: &T) -> Vec<(String, String)> {
    let value = serde_json::to_value(config).expect("a flat config");
    let fields = value.as_object().expect("a flat config");
    fields
        .iter()
        .filter(|(_, value)| !value.is_null())
        .map(|(field, value)| {
            let text = match value {
                Value::String(text) => text.clone(),
                other => other.to_string(),
            };
            (format!("{prefix}{}", field.to_ascii_uppercase()), text)
        })
        .collect()
}

pub fn build_info_line() -> String {
    serde_json::to_string(&BuildInfo::current()).expect("a build info line")
}

const PROFILE_SETTINGS: &str = "settings.json";
