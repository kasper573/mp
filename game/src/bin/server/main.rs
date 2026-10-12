mod auth;
mod transport;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use bevy_app::App;
use bevy_ecs::prelude::*;
use bevy_replicon::prelude::{ConnectedClient, RepliconChannels, ServerState};
use bevy_replicon::shared::backend::server_messages::ServerMessages;
use bevy_state::prelude::NextState;
use game::core::content::sync::{ServedContent, well_formed_hash};
use game::core::content::{Content, ContentScope, FilesystemFolder, version, with_content};
use game::core::net::channels::RenetChannelsExt;
use game::core::platform::exit_when_stdin_closes;
use game::core::time::{UnixMillis, UtcHour, WallClock};
use game::systems::GameSettings;
use game::systems::account::Identity;
use game::systems::area::transition;
use game::systems::area::{self, AreaDef};
use game::systems::launch::{
    AuthMode, BUILD_INFO_FLAG, ReadyLine, SERVER_ENV_PREFIX, ServedAreas, ServerConfig,
    ServerReady, Switch, TEST_CHARACTER_ROUTE, TestCharacterRequest, build_info_line,
};
use game::systems::player::snapshot::{self, CharacterSnapshot, JoinAs};
use game::systems::player::{ClientId, SpawnPolicy, SpawnRules};
use game::systems::spectate::{self, SpectatorTransfer};
use game::systems::{REPLICATION_INTERVAL, TICK_HZ};
use metrics::{counter, gauge, histogram};
use rand::RngCore;
use renet2::{ConnectionConfig, DisconnectReason, RenetServer, ServerEvent};
use transport::WsTransport;

service::heap_profiling!();

const TOKEN_EXPIRE: Duration = Duration::from_secs(30);

fn main() {
    if std::env::args().any(|arg| arg == BUILD_INFO_FLAG) {
        println!("{}", build_info_line());
        return;
    }
    let config: ServerConfig = envy::prefixed(SERVER_ENV_PREFIX)
        .from_env()
        .expect("RIFT_GAME_SERVER_* environment");
    let _profiler = service::profiler(
        "rift-game-server",
        config.pyroscope_enabled,
        config.pyroscope_sample_hz,
    );
    if config.exit_on_stdin_eof {
        exit_when_stdin_closes();
    }
    let http_bind = SocketAddr::new(config.bind, config.port);
    let ws_bind = SocketAddr::new(config.bind, config.ws_port);

    // One multi-threaded tokio runtime backs both the HTTP API and the WebSocket transport's
    // accept/read/write tasks; it outlives `main` because `simulate` never returns.
    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");

    let content = game::systems::load_content(
        Arc::new(FilesystemFolder(config.content_dir.clone())),
        "the server did not start",
    )
    .unwrap_or_else(|report| {
        eprint!("{report}");
        std::process::exit(2);
    });
    let settings = content.built::<GameSettings>();
    let served = ServedContent::new(
        &content,
        &FilesystemFolder(config.content_dir.clone()),
        version::build(),
        &settings.name,
    )
    .unwrap_or_else(|error| {
        eprintln!("{}: {error}", config.content_dir.display());
        std::process::exit(2);
    });

    let metrics = service::recorder();
    let sessions = Sessions::default();
    let online = Online::default();
    let area_ids = select_areas(&content, config.areas);
    let http = Http {
        sessions: sessions.clone(),
        auth: match config.auth {
            AuthMode::Oidc => Auth::Oidc(verifier()),
            AuthMode::Fake => Auth::Fake,
        },
        test_characters: match config.test_characters {
            Switch::On => Some(TestCharacters {
                content,
                areas: area_ids.clone(),
                pending: Arc::default(),
                online: online.clone(),
            }),
            Switch::Off => None,
        },
        served: Arc::new(served),
    };
    let listener = runtime
        .block_on(tokio::net::TcpListener::bind(http_bind))
        .unwrap_or_else(|error| panic!("cannot bind {http_bind}: {error}"));
    let http_addr = listener.local_addr().expect("bound http address");
    let test_characters = http.test_characters.clone();
    let api = serve_http(listener, http, metrics);

    let settings = Settings {
        area_ids,
        max_clients: config.max_clients,
        rules: SpawnRules {
            policy: config.player_spawn_type,
            immortal: config.player_immortal,
        },
        reset: config.daily_reset_utc_hour,
        test_characters,
    };
    simulate(
        ws_bind,
        http_addr,
        sessions,
        online,
        runtime.handle().clone(),
        content,
        settings,
        api,
    );
}

struct Settings {
    area_ids: Vec<area::Id>,
    max_clients: usize,
    rules: SpawnRules,
    reset: UtcHour,
    test_characters: Option<TestCharacters>,
}

#[allow(clippy::too_many_arguments)]
fn simulate(
    ws_bind: SocketAddr,
    http_addr: SocketAddr,
    sessions: Sessions,
    online: Online,
    runtime: tokio::runtime::Handle,
    assets: Content,
    settings: Settings,
    api: impl Future<Output = ()> + Send + 'static,
) {
    let Settings {
        area_ids,
        max_clients,
        rules,
        reset,
        test_characters,
    } = settings;
    let spawn = area_ids
        .iter()
        .position(|id| *id == assets.built::<GameSettings>().spawn.area)
        .unwrap_or(0);
    let mut worlds: Vec<App> = area_ids
        .iter()
        .enumerate()
        .map(|(ordinal, &id)| build_world(id, &assets, rules, ordinal as u64, wall_clock(reset)))
        .collect();

    let (connection_config, client_channels) = {
        let channels = worlds[0].world().resource::<RepliconChannels>();
        let config =
            ConnectionConfig::from_channels(channels.server_configs(), channels.client_configs());
        (config, channels.client_channels().len())
    };
    let mut server = RenetServer::new(connection_config);
    let mut transport = WsTransport::bind(ws_bind, sessions, max_clients, runtime.clone());
    // Opened only once players can connect, so a passing health check means the game is playable.
    runtime.spawn(api);

    let ready = ReadyLine {
        ready: ServerReady {
            build: version::build().to_owned(),
            content_version: assets.built::<GameSettings>().content_version.0.clone(),
            http: http_addr.port(),
            ws: transport.local_addr().port(),
        },
    };
    println!("{}", serde_json::to_string(&ready).expect("a ready line"));

    let mut conns: HashMap<u64, Conn> = HashMap::new();
    let mut transfers: Vec<Transfer> = Vec::new();
    let mut next_client = 1u32;
    let mut next_area = 0usize;
    let mut tick = 0u64;
    let frame = TICK_HZ.period();
    let mut last = Instant::now();
    loop {
        let started = Instant::now();
        let dt = started - last;
        last = started;
        tick += 1;

        server.update(dt);
        transport.update(&mut server);

        while let Some(event) = server.get_event() {
            match event {
                ServerEvent::ClientConnected { client_id } => {
                    counter!("rift_client_connections_opened_total").increment(1);
                    let identity = transport.take_identity(client_id);
                    let account = identity.as_ref().map(|identity| identity.id.clone());
                    let mut accounts = online.0.lock().expect("online lock");
                    let mut join_as = None;
                    let (client, area) =
                        match account.as_ref().and_then(|account| accounts.get(account)) {
                            // Another tab of this account is already connected: share its player id and
                            // join in whichever area that player currently occupies, so both sockets
                            // drive the one character (last input wins).
                            Some(&client) => {
                                let area = conns
                                    .values()
                                    .find(|conn| conn.client == client)
                                    .map_or(spawn, |conn| conn.area);
                                (client, area)
                            }
                            None => {
                                let client = ClientId(next_client);
                                next_client += 1;
                                join_as = account.as_ref().and_then(|account| {
                                    test_characters
                                        .as_ref()
                                        .and_then(|characters| characters.take(account))
                                });
                                if let Some(account) = account {
                                    accounts.insert(account, client);
                                }
                                let area = match (&join_as, rules.policy) {
                                    (Some(join_as), _) => area_ids
                                        .iter()
                                        .position(|&id| id == join_as.start.area)
                                        .unwrap_or(spawn),
                                    (None, SpawnPolicy::Dist) => {
                                        let area = next_area % worlds.len();
                                        next_area += 1;
                                        area
                                    }
                                    (None, SpawnPolicy::Map) => spawn,
                                };
                                (client, area)
                            }
                        };
                    drop(accounts);
                    let entity = spawn_conn(&mut worlds[area], client, client_id, identity);
                    if let Some(join_as) = join_as {
                        worlds[area].world_mut().entity_mut(entity).insert(join_as);
                    }
                    conns.insert(
                        client_id,
                        Conn {
                            area,
                            entity,
                            client,
                        },
                    );
                }
                ServerEvent::ClientDisconnected { client_id, reason } => {
                    counter!("rift_client_connections_closed_total", "code" => disconnect_code(&reason))
                        .increment(1);
                    if let Some(conn) = conns.remove(&client_id) {
                        worlds[conn.area].world_mut().despawn(conn.entity);
                        if !conns.values().any(|other| other.client == conn.client) {
                            online
                                .0
                                .lock()
                                .expect("online lock")
                                .retain(|_, &mut client| client != conn.client);
                        }
                    }
                }
            }
        }

        for (&network_id, conn) in &conns {
            let world = worlds[conn.area].world_mut();
            for channel in 0..client_channels as u8 {
                while let Some(message) = server.receive_message(network_id, channel) {
                    world.resource_mut::<ServerMessages>().insert_received(
                        conn.entity,
                        channel,
                        message,
                    );
                }
            }
        }

        game::systems::step_areas(&mut worlds, wall_clock(reset));
        game::systems::notification::relay(
            &mut worlds.iter_mut().map(App::world_mut).collect::<Vec<_>>(),
        );

        begin_transfers(&mut worlds, &mut transfers, tick);

        for app in worlds.iter_mut() {
            let world = app.world_mut();
            let sent: Vec<_> = world
                .resource_mut::<ServerMessages>()
                .drain_sent()
                .collect();
            for (entity, channel, message) in sent {
                if let Some(&Wire(network_id)) = world.get::<Wire>(entity) {
                    server.send_message(network_id, channel as u8, message);
                }
            }
        }

        finish_transfers(&mut worlds, &mut conns, &mut transfers, tick);

        transport.send(&mut server);

        counter!("rift_ticks_total").increment(1);
        histogram!("rift_tick_duration_seconds").record(started.elapsed().as_secs_f64());
        histogram!("rift_tick_interval_seconds").record(dt.as_secs_f64());
        gauge!("rift_clients_connected").set(conns.len() as f64);
        record_ecs_metrics(&worlds);
        record_network_metrics(&server, &conns);

        if let Some(remaining) = frame.checked_sub(started.elapsed()) {
            std::thread::sleep(remaining);
        }
    }
}

fn wall_clock(reset: UtcHour) -> WallClock {
    let since_epoch = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .expect("system clock is set after 1970");
    WallClock {
        now: UnixMillis(u64::try_from(since_epoch.as_millis()).expect("millis since 1970 fit u64")),
        reset,
    }
}

fn record_ecs_metrics(worlds: &[App]) {
    gauge!("rift_worlds").set(worlds.len() as f64);
    let mut entities = 0usize;
    let mut components = 0usize;
    let mut archetypes = 0usize;
    let mut tables = 0usize;
    for app in worlds {
        let world = app.world();
        for archetype in world.archetypes().iter() {
            entities += archetype.len() as usize;
            components += archetype.len() as usize * archetype.component_count();
        }
        archetypes += world.archetypes().len();
        tables += world.storages().tables.len();
    }
    gauge!("rift_entities").set(entities as f64);
    gauge!("rift_components").set(components as f64);
    gauge!("rift_archetypes").set(archetypes as f64);
    gauge!("rift_tables").set(tables as f64);
}

fn record_network_metrics(server: &RenetServer, conns: &HashMap<u64, Conn>) {
    let mut sent_per_sec = 0.0;
    let mut received_per_sec = 0.0;
    let mut max_packet_loss = 0.0;
    for &network_id in conns.keys() {
        if let Ok(info) = server.network_info(network_id) {
            sent_per_sec += info.bytes_sent_per_second;
            received_per_sec += info.bytes_received_per_second;
            max_packet_loss = f64::max(max_packet_loss, info.packet_loss);
            histogram!("rift_client_rtt_seconds").record(info.rtt);
        }
    }
    gauge!("rift_net_bytes_sent_per_sec").set(sent_per_sec);
    gauge!("rift_net_bytes_received_per_sec").set(received_per_sec);
    gauge!("rift_packet_loss_ratio").set(max_packet_loss);
}

fn disconnect_code(reason: &DisconnectReason) -> &'static str {
    match reason {
        DisconnectReason::Transport => "transport",
        DisconnectReason::DisconnectedByClient => "by_client",
        DisconnectReason::DisconnectedByServer => "by_server",
        DisconnectReason::PacketSerialization(_) => "packet_serialization",
        DisconnectReason::PacketDeserialization(_) => "packet_deserialization",
        DisconnectReason::ReceivedInvalidChannelId(_) => "invalid_channel_id",
        DisconnectReason::SendChannelError { .. } => "send_channel_error",
        DisconnectReason::ReceiveChannelError { .. } => "receive_channel_error",
    }
}

struct Conn {
    area: usize,
    entity: Entity,
    client: ClientId,
}

#[derive(Component)]
struct Wire(u64);

fn select_areas(content: &Content, areas: ServedAreas) -> Vec<game::systems::area::Id> {
    match areas {
        ServedAreas::Real => content.ids::<AreaDef>().collect(),
        // The bench area is one template instanced `count` times; the count is bounded only by the
        // machine, not by how many area rows the content table happens to define.
        ServedAreas::Bench(count) => vec![content.built::<GameSettings>().bench; count],
    }
}

fn build_world(
    area: game::systems::area::Id,
    assets: &Content,
    rules: SpawnRules,
    ordinal: u64,
    clock: WallClock,
) -> App {
    let mut app = game::systems::server_app(area, ordinal, clock, assets);
    app.insert_resource(game::core::math::Rng::from_entropy());
    app.insert_resource(rules);
    app.finish();
    app.cleanup();
    app.world_mut()
        .resource_mut::<NextState<ServerState>>()
        .set(ServerState::Running);
    app.update();
    app
}

/// The whole connection bundle is spawned in one call so `Add` observers on any of its
/// components (e.g. greeting, terminal tab issuance) observe the complete connection,
/// `Identity` included.
fn spawn_conn(
    app: &mut App,
    client: ClientId,
    network_id: u64,
    identity: Option<Identity>,
) -> Entity {
    let world = app.world_mut();
    let base = (ConnectedClient { max_size: 1200 }, client, Wire(network_id));
    match identity {
        Some(identity) => world.spawn((base, identity)).id(),
        None => world.spawn(base).id(),
    }
}

/// A client (and all its connections) that left its world and is waiting to be re-created in the
/// destination world: a player whose character stepped through a cross-area portal, or a spectator
/// whose player is in another world. Leaving blinds the connections to the source world, and the wait
/// lets the resulting despawns reach them first, so their replication state is empty before the
/// destination's fresh snapshot arrives over the same connections — no entity-id or tick collision
/// between the two worlds. The wait is one replication period (not one tick): a world only replicates
/// every `REPLICATION_INTERVAL` ticks, so the despawns aren't guaranteed sent until then.
struct Transfer {
    client: ClientId,
    dest: usize,
    departed_tick: u64,
    arrival: Arrival,
}

enum Arrival {
    Character(Box<transition::Traveler>),
    Spectator(SpectatorTransfer),
}

/// Phase 1: take everyone leaving their world this tick out of it, and queue the move.
fn begin_transfers(worlds: &mut [App], transfers: &mut Vec<Transfer>, tick: u64) {
    for app in worlds.iter_mut() {
        for traveler in transition::departing(app.world_mut()) {
            transfers.push(Transfer {
                client: traveler.client,
                dest: traveler.dest_area.index(),
                departed_tick: tick,
                arrival: Arrival::Character(Box::new(traveler)),
            });
        }
    }
    let arriving: Vec<(ClientId, usize)> = transfers
        .iter()
        .filter(|transfer| matches!(transfer.arrival, Arrival::Character(_)))
        .map(|transfer| (transfer.client, transfer.dest))
        .collect();
    for spectator in spectate::coordinate(worlds, arriving.into_iter()) {
        transfers.push(Transfer {
            client: spectator.client,
            dest: spectator.dest,
            departed_tick: tick,
            arrival: Arrival::Spectator(spectator),
        });
    }
}

/// Phase 2: once the source world's despawns have been sent (a replication period after departing) —
/// move every socket of the client to the destination world and re-create the player or spectator there.
fn finish_transfers(
    worlds: &mut [App],
    conns: &mut HashMap<u64, Conn>,
    transfers: &mut Vec<Transfer>,
    tick: u64,
) {
    let mut index = 0;
    while index < transfers.len() {
        if tick < transfers[index].departed_tick + REPLICATION_INTERVAL {
            index += 1;
            continue;
        }
        let Transfer {
            client,
            dest,
            arrival,
            ..
        } = transfers.remove(index);
        let movers: Vec<(u64, usize, Entity)> = conns
            .iter()
            .filter(|(_, conn)| conn.client == client)
            .map(|(&network_id, conn)| (network_id, conn.area, conn.entity))
            .collect();
        if movers.is_empty() {
            continue;
        }
        for (network_id, area, entity) in movers {
            let identity = worlds[area].world().get::<Identity>(entity).cloned();
            worlds[area].world_mut().despawn(entity);
            let entity = spawn_conn(&mut worlds[dest], client, network_id, identity);
            conns.insert(
                network_id,
                Conn {
                    area: dest,
                    entity,
                    client,
                },
            );
        }
        match arrival {
            Arrival::Character(traveler) => {
                transition::arrive(worlds[dest].world_mut(), *traveler);
            }
            Arrival::Spectator(spectator) => spectate::arrive(worlds[dest].world_mut(), spectator),
        }
    }
}

#[derive(Resource, Clone, Default)]
struct Sessions(Arc<Mutex<HashMap<u64, Pending>>>);

struct Pending {
    identity: Identity,
    minted: Instant,
}

impl Sessions {
    fn put(&self, client_id: u64, identity: Identity) {
        let mut map = self.0.lock().expect("sessions lock");
        let now = Instant::now();
        map.retain(|_, pending| {
            now.duration_since(pending.minted) < TOKEN_EXPIRE + Duration::from_secs(5)
        });
        map.insert(
            client_id,
            Pending {
                identity,
                minted: now,
            },
        );
    }

    fn take(&self, client_id: u64) -> Option<Identity> {
        self.0
            .lock()
            .expect("sessions lock")
            .remove(&client_id)
            .map(|pending| pending.identity)
    }
}

#[derive(Clone, Default)]
struct Online(Arc<Mutex<HashMap<String, ClientId>>>);

#[derive(Clone)]
struct TestCharacters {
    content: Content,
    areas: Vec<area::Id>,
    pending: Arc<Mutex<HashMap<String, JoinAs>>>,
    online: Online,
}

impl TestCharacters {
    fn take(&self, account: &str) -> Option<JoinAs> {
        self.pending.lock().expect("pending lock").remove(account)
    }
}

#[derive(Clone)]
enum Auth {
    Oidc(Arc<Mutex<auth::Verifier>>),
    Fake,
}

#[derive(Clone)]
struct Http {
    sessions: Sessions,
    auth: Auth,
    test_characters: Option<TestCharacters>,
    served: Arc<ServedContent>,
}

async fn serve_http(
    listener: tokio::net::TcpListener,
    http: Http,
    metrics: service::PrometheusHandle,
) {
    let mut router = axum::Router::new()
        .route("/session", post(session))
        .route("/health", get(health))
        .route("/content/manifest", get(manifest))
        .route("/content/files/{hash}", get(content_file));
    if http.test_characters.is_some() {
        router = router.route(TEST_CHARACTER_ROUTE, post(test_character));
    }
    let router = service::track(router.with_state(http), metrics);
    ctrlc::set_handler(|| std::process::exit(0)).expect("install stop handler");
    axum::serve(listener, router).await.expect("axum serves");
}

async fn manifest(State(http): State<Http>) -> Response {
    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        serde_json::to_string(&http.served.manifest).expect("manifest serializes"),
    )
        .into_response()
}

async fn content_file(
    State(http): State<Http>,
    axum::extract::Path(hash): axum::extract::Path<String>,
) -> Response {
    if !well_formed_hash(&hash) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    match http.served.file(&hash) {
        Some(bytes) => (
            [
                (header::CONTENT_TYPE, "application/octet-stream"),
                (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
            ],
            bytes.to_vec(),
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

#[derive(serde::Deserialize)]
struct SessionRequest {
    build: String,
    rows: String,
}

async fn session(State(http): State<Http>, headers: HeaderMap, body: String) -> Response {
    let authorization = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let identity = match resolve(&http, authorization) {
        Ok(identity) => identity,
        Err(status) => return status.into_response(),
    };
    let request: SessionRequest = match serde_json::from_str(&body) {
        Ok(request) => request,
        Err(error) => return (StatusCode::BAD_REQUEST, error.to_string()).into_response(),
    };
    if request.build != version::build() {
        return (StatusCode::CONFLICT, "reload").into_response();
    }
    if request.rows != http.served.manifest.rows.hash {
        return (StatusCode::CONFLICT, "sync").into_response();
    }

    // The ticket is the renet client id. The browser opens `wss://host/?ticket=<id>`; the WebSocket
    // handshake claims it single-use. Unguessable in 2^64, ~30s expiry, only ever sent over TLS.
    let client_id = rand::rng().next_u64();
    http.sessions.put(client_id, identity);
    (
        [
            (header::CONTENT_TYPE, "text/plain"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        client_id.to_string(),
    )
        .into_response()
}

async fn test_character(State(http): State<Http>, headers: HeaderMap, body: String) -> Response {
    let Some(characters) = http.test_characters.as_ref() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let authorization = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let identity = match resolve(&http, authorization) {
        Ok(identity) => identity,
        Err(status) => return status.into_response(),
    };
    let content = characters.content;
    let (request, scope) = with_content(ContentScope::of(&content), || {
        serde_json::from_str::<TestCharacterRequest>(&body)
    });
    let request = match request {
        Ok(request) => request,
        Err(error) => return (StatusCode::BAD_REQUEST, error.to_string()).into_response(),
    };
    if let Some(unknown) = scope.unknown().next() {
        return (
            StatusCode::BAD_REQUEST,
            format!("no {} `{}`", unknown.table, unknown.key),
        )
            .into_response();
    }
    let Some(character) = content.by_key::<CharacterSnapshot>(&request.test_character) else {
        return (
            StatusCode::BAD_REQUEST,
            format!("no test character `{}`", request.test_character),
        )
            .into_response();
    };
    let start = request
        .start
        .unwrap_or_else(|| snapshot::start_of(&content, character.get(&content)));
    if let Err(problem) = area::check_place(&content, start) {
        return (
            StatusCode::BAD_REQUEST,
            format!(
                "bad start: {}, expected {}",
                problem.found, problem.expected
            ),
        )
            .into_response();
    }
    if !characters.areas.contains(&start.area) {
        return (
            StatusCode::BAD_REQUEST,
            format!(
                "bad start: this server runs no {}",
                start.area.key(&content)
            ),
        )
            .into_response();
    }
    if characters
        .online
        .0
        .lock()
        .expect("online lock")
        .contains_key(&identity.id)
    {
        return (StatusCode::CONFLICT, "already in a world").into_response();
    }
    characters.pending.lock().expect("pending lock").insert(
        identity.id,
        JoinAs {
            snapshot: character.get(&content).clone(),
            start,
        },
    );
    StatusCode::NO_CONTENT.into_response()
}

fn resolve(http: &Http, authorization: &str) -> Result<Identity, StatusCode> {
    let token = authorization
        .strip_prefix("Bearer ")
        .unwrap_or(authorization);
    let verifier = match &http.auth {
        Auth::Oidc(verifier) => verifier,
        Auth::Fake => {
            let id = token.strip_prefix("fake:").unwrap_or(token);
            if id.is_empty() {
                return Err(StatusCode::UNAUTHORIZED);
            }
            return Ok(Identity {
                id: id.to_owned(),
                name: id.to_owned(),
                roles: Vec::new(),
            });
        }
    };
    let claims = verifier
        .lock()
        .expect("verifier lock")
        .verify(token)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
    Ok(Identity {
        id: claims.subject,
        name: claims.name,
        roles: claims
            .roles
            .iter()
            .filter_map(|role| role.parse::<game::systems::account::Role>().ok())
            .collect(),
    })
}

async fn health(State(http): State<Http>) -> Response {
    let ready = match &http.auth {
        Auth::Oidc(verifier) => verifier.lock().expect("verifier lock").ready(),
        Auth::Fake => true,
    };
    if ready {
        "ok".into_response()
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "auth keys unavailable").into_response()
    }
}

fn verifier() -> Arc<Mutex<auth::Verifier>> {
    #[derive(serde::Deserialize)]
    struct AuthConfig {
        issuer: String,
        audience: String,
        jwks_uri: String,
    }
    let config: AuthConfig = envy::prefixed("RIFT_AUTH_")
        .from_env()
        .expect("RIFT_AUTH_* environment");
    let mut verifier = auth::Verifier::new(&config.issuer, &config.audience, &config.jwks_uri);
    match verifier.warm() {
        Ok(()) => println!("auth enabled, issuer {}", config.issuer),
        Err(error) => println!(
            "auth enabled, issuer {} (jwks warm-up failed: {error})",
            config.issuer
        ),
    }
    Arc::new(Mutex::new(verifier))
}
