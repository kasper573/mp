use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;

use game::core::time::UtcHour;
use game::systems::launch::{
    AuthMode, CLIENT_ENV_PREFIX, ClientConfig, SERVER_ENV_PREFIX, ServerConfig, Switch, env_of,
};
use game::systems::player::SpawnPolicy;

fn server_config(rng_seed: Option<u64>) -> ServerConfig {
    ServerConfig {
        bind: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 4000,
        ws_port: 4001,
        max_clients: 8,
        content_dir: PathBuf::from("/games/example"),
        player_spawn_type: SpawnPolicy::Dist,
        player_immortal: true,
        rng_seed,
        daily_reset_utc_hour: UtcHour::try_from(5).expect("an hour of the day"),
        auth: AuthMode::Fake,
        test_characters: Switch::On,
        exit_on_stdin_eof: true,
        pyroscope_enabled: false,
        pyroscope_sample_hz: 100,
    }
}

fn read_back<T: serde::de::DeserializeOwned>(prefix: &str, config: &impl serde::Serialize) -> T {
    envy::prefixed(prefix)
        .from_iter(env_of(prefix, config))
        .expect("the env written for a config reads back")
}

#[test]
fn server_config_reads_back_from_its_env() {
    let config = server_config(Some(7));
    assert_eq!(
        read_back::<ServerConfig>(SERVER_ENV_PREFIX, &config),
        config
    );
}

#[test]
fn server_config_without_a_seed_reads_back_from_its_env() {
    let config = server_config(None);
    assert_eq!(
        read_back::<ServerConfig>(SERVER_ENV_PREFIX, &config),
        config
    );
}

#[test]
fn client_config_reads_back_from_its_env() {
    let config = ClientConfig {
        game_server_url: "http://127.0.0.1:4000".to_owned(),
        game_server_ws_url: "ws://127.0.0.1:4001".to_owned(),
        access_token: "a.b.c".to_owned(),
        profile_dir: PathBuf::from("/profiles/tester"),
        exit_on_stdin_eof: false,
        probe: Some(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 9000)),
    };
    assert_eq!(
        read_back::<ClientConfig>(CLIENT_ENV_PREFIX, &config),
        config
    );
}
