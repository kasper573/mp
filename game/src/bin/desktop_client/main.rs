mod platform;
mod store;

use std::sync::Arc;

use bevy::window::Window;
use game::core::platform::{StartParams, exit_when_stdin_closes};
use game::systems::launch::{BUILD_INFO_FLAG, CLIENT_ENV_PREFIX, ClientConfig, build_info_line};
use game::systems::{client_app, probe};

fn main() {
    if std::env::args().any(|arg| arg == BUILD_INFO_FLAG) {
        println!("{}", build_info_line());
        return;
    }
    let config: ClientConfig = envy::prefixed(CLIENT_ENV_PREFIX)
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
    let mut app = client_app(
        Arc::new(platform::DesktopPlatform::new(config.profile_dir)),
        params,
        Window::default(),
    );
    if let Some(driver) = config.probe {
        probe::install(&mut app, platform::SocketProbe::connect(driver));
    }
    app.run();
}
