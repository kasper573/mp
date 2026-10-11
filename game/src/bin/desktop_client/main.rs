mod platform;
mod store;

use std::path::PathBuf;
use std::sync::Arc;

use bevy::window::Window;
use game::core::platform::{StartParams, exit_when_stdin_closes};

#[derive(serde::Deserialize)]
struct Config {
    game_server_url: String,
    game_server_ws_url: String,
    access_token: String,
    profile_dir: PathBuf,
    exit_on_stdin_eof: bool,
}

fn main() {
    if std::env::args().any(|arg| arg == "--build-info") {
        println!("{}", game::systems::build_info());
        return;
    }
    let config: Config = envy::prefixed("RIFT_CLIENT_")
        .from_env()
        .expect("RIFT_CLIENT_* environment");
    if config.exit_on_stdin_eof {
        exit_when_stdin_closes();
    }
    let params = StartParams {
        access_token: Some(config.access_token),
        game_server_url: config.game_server_url,
        game_server_ws_url: config.game_server_ws_url,
    };
    game::systems::client_app(
        Arc::new(platform::DesktopPlatform::new(config.profile_dir)),
        params,
        Window {
            title: "Rift".to_owned(),
            ..Default::default()
        },
    )
    .run();
}
