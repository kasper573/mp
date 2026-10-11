pub mod account;
pub mod actor;
pub mod area;
pub mod attention;
pub mod belongings;
pub mod chat;
pub mod combat;
pub mod debug;
pub mod dialogue;
pub mod effect;
pub mod equipment;
pub mod fps;
pub mod history;
pub mod hud;
pub mod input;
pub mod interact;
pub mod interface;
pub mod item;
pub mod job;
pub mod memory;
pub mod movement;
pub mod notification;
pub mod npc;
pub mod player;
pub mod quest;
pub mod reach;
pub mod rewards;
pub mod scene;
pub mod script;
pub mod settings;
pub mod shop;
pub mod spectate;
pub mod stat;
pub mod terminal;
pub mod text;
pub mod view;
pub mod visibility;

use schemars::JsonSchema;
use std::collections::HashMap;
use std::sync::LazyLock;

use bevy_app::App;
use bevy_ecs::message::{Message, Messages};
use bevy_ecs::prelude::{Bundle, Res, ResMut, Resource, World};
use bevy_replicon::prelude::{FromClient, Replicated};
use bevy_terminal::Terminal;

use crate::core::assets::SyncedFiles;
use crate::core::content::sync::SyncedContent;
use crate::core::content::{Content, ContentFolder, ContentRegistry, LoadReport};
use terminal::TerminalKind;

use actor::{Actor, Hitbox};
use area::AreaTag;
use movement::Position;

pub const TICK_HZ: crate::core::time::Hertz = crate::core::time::Hertz(30.0);

/// Simulation ticks per replication. The world steps every tick, but state is replicated to clients
/// (and visibility recomputed) only every Nth tick; clients interpolate between the sparser
/// snapshots. Replication serialization is the dominant server cost and scales with this rate, so
/// replicating at `TICK_HZ / REPLICATION_INTERVAL` (10 Hz) rather than every tick cuts it ~3x.
pub const REPLICATION_INTERVAL: u64 = 3;

/// Seconds of server time covered by one replication snapshot.
pub const REPLICATION_PERIOD: crate::core::time::Seconds =
    crate::core::time::Seconds(REPLICATION_INTERVAL as f32 / TICK_HZ.0);

static TERMINALS: LazyLock<HashMap<TerminalKind, &'static Terminal>> = LazyLock::new(|| {
    TerminalKind::ALL
        .into_iter()
        .map(|kind| (kind, kind.terminal()))
        .collect()
});

pub fn protocol(app: &mut App) {
    actor::register(app);
    crate::core::babble::register(app);
    crate::core::interpolate::register(app);
    notification::register(app);
    area::register(app);
    attention::register(app);
    combat::register(app);
    dialogue::register(app);
    stat::register(app);
    effect::register(app);
    equipment::register(app);
    history::register(app);
    item::register(app);
    job::register(app);
    movement::register(app);
    interact::register(app);
    npc::register(app);
    shop::register(app);
    quest::register(app);
    player::register(app);
    spectate::register(app);
    bevy_terminal::register(app, &TERMINALS);
}

#[derive(Resource, Clone, Copy)]
pub struct WorldArea(pub area::Id);

#[derive(JsonSchema, Resource, Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GameSettings {
    pub name: String,
    pub content_version: crate::core::content::ContentVersion,
    pub spawn: script::Place,
    pub player: player::Id,
    pub bench: area::Id,
}

#[derive(Bundle)]
pub struct Character {
    pub replicated: Replicated,
    pub position: Position,
    pub actor: Actor,
    pub hitbox: Hitbox,
    pub area: AreaTag,
}

/// Builds one area world. `ordinal` is the world's slot among the worlds a driver steps concurrently;
/// it only staggers the replication phase, so identical area instances still replicate on different
/// ticks. The driver passes each world's index.
pub fn server_app(
    area: area::Id,
    ordinal: u64,
    clock: crate::core::time::WallClock,
    assets: &Content,
) -> App {
    use bevy_app::{First, PostUpdate, Startup, Update};
    use bevy_ecs::schedule::{IntoScheduleConfigs, Schedules, SingleThreadedExecutor};
    use bevy_replicon::prelude::{AuthMethod, RepliconSharedPlugin, ServerState};
    use bevy_replicon::server::{ServerSystems, increment_tick};
    use bevy_state::prelude::in_state;

    let mut app = App::new();
    app.insert_resource(WorldArea(area));
    app.insert_resource(assets.built::<GameSettings>().clone());
    app.insert_resource(clock);
    app.insert_resource(*assets);
    app.insert_resource(assets.built::<quest::Parties>().clone());
    app.insert_resource(assets.built::<script::RiftScripts>().clone());
    app.init_resource::<script::RiftInstances>();
    app.add_plugins((bevy_time::TimePlugin, bevy_state::app::StatesPlugin));
    app.add_plugins(
        bevy_app::PluginGroup::build(bevy_replicon::prelude::RepliconPlugins)
            .set(RepliconSharedPlugin {
                auth_method: AuthMethod::None,
            })
            // No tick schedule: we drive replication ourselves at REPLICATION_INTERVAL via
            // `on_replication_tick`, rather than letting replicon tick every frame.
            .set(bevy_replicon::server::ServerPlugin {
                tick_schedule: None,
                ..Default::default()
            }),
    );
    protocol(&mut app);
    visibility::register(&mut app);
    app.init_resource::<player::Players>()
        .init_resource::<spectate::Spectators>()
        .init_resource::<combat::RegenAt>()
        // Seed the phase by the world's ordinal so worlds replicate on different ticks, spreading the
        // serialization load across ticks instead of spiking every Nth tick in lockstep.
        .insert_resource(ReplicationClock(ordinal))
        .add_message::<combat::Died>()
        .add_message::<rewards::KillCredited>()
        .add_observer(player::greet)
        .add_observer(player::client_left)
        .add_observer(spectate::client_left)
        .add_systems(
            Startup,
            (
                script::spawn_stateless,
                area::object::spawn_all,
                npc::spawn_all,
            )
                .chain(),
        )
        .add_systems(First, advance_replication_clock)
        .add_systems(
            PostUpdate,
            increment_tick
                .in_set(ServerSystems::IncrementTick)
                .run_if(in_state(ServerState::Running))
                .run_if(on_replication_tick),
        )
        .add_systems(
            Update,
            (
                (
                    actor::reset,
                    player::arrival_holds,
                    combat::regen,
                    movement::move_request,
                    combat::request,
                    item::use_item,
                    item::drop_item,
                    item::pickup_request,
                    interact::interact_request,
                    dialogue::requests,
                    shop::requests,
                    quest::requests,
                    equipment::unequip,
                    effect::expire,
                    combat::combat,
                )
                    .chain(),
                (
                    (rewards::grant, quest::credit, npc::defeated).chain(),
                    (
                        script::query::index_actors,
                        (area::object::track, npc::approach)
                            .chain()
                            .run_if(on_replication_tick),
                    )
                        .chain(),
                    script::run_tick,
                    npc::body::drive,
                    movement::advance,
                    item::pickups,
                    interact::interactions,
                    (
                        dialogue::hold,
                        dialogue::refresh.run_if(on_replication_tick),
                    )
                        .chain(),
                    (shop::hold, shop::refresh.run_if(on_replication_tick)).chain(),
                    quest::refresh.run_if(on_replication_tick),
                    item::expire_drops,
                    player::join,
                    player::respawn,
                    spectate::requests,
                    (npc::run_respawn, npc::dismiss).chain(),
                )
                    .chain(),
                (
                    bevy_terminal::ingest::<TerminalKind>,
                    bevy_terminal::dispatch::<TerminalKind>,
                    chat::rebroadcast,
                    belongings::notify_changes,
                    history::backfill,
                    attention::update.run_if(on_replication_tick),
                    visibility::update.run_if(on_replication_tick),
                )
                    .chain(),
            )
                .chain(),
        );

    // An area world is stepped single-threaded so the driver (server/bench) owns all parallelism by
    // running whole areas concurrently. Letting each area's schedules fan out onto the global task
    // pool too would nest a work-stealing pool inside the per-area pool and oversubscribe the cores.
    for (_, schedule) in app.world_mut().resource_mut::<Schedules>().iter_mut() {
        schedule.set_executor(SingleThreadedExecutor::new());
    }
    app
}

/// Steps every area world one tick, fanning the isolated worlds across all cores. Areas share only the
/// read-only asset service, so this is embarrassingly parallel. The worlds (not the owning `App`s) are
/// stepped directly because `App` is `!Send` (its runner box carries no `Send` bound) while `World` is
/// `Send`; for these single-schedule headless apps `world.run_schedule(Main)` + `clear_trackers` is
/// exactly what `App::update` does.
pub fn step_areas(apps: &mut [App], clock: crate::core::time::WallClock) {
    use bevy_app::Main;
    use rayon::prelude::*;

    apps.iter_mut()
        .map(App::world_mut)
        .collect::<Vec<_>>()
        .into_par_iter()
        .for_each(|world| {
            world.insert_resource(clock);
            world.run_schedule(Main);
            world.clear_trackers();
        });
}

pub fn load_content(
    folder: std::sync::Arc<dyn ContentFolder>,
    outcome: &str,
) -> Result<Content, LoadReport> {
    crate::core::content::load(
        &registry(),
        folder,
        crate::core::content::version::build(),
        outcome,
    )
}

pub fn install_content(world: &mut World, synced: SyncedContent) -> Result<(), LoadReport> {
    let before = world.get_resource::<SyncedContent>();
    if before.is_some_and(|before| before.same_as(&synced)) {
        return Ok(());
    }
    let content = load_content(
        std::sync::Arc::new(synced.folder()),
        "the content did not load",
    )?;
    let changed = before.map(|before| synced.changed_assets(before));
    world
        .resource::<SyncedFiles>()
        .replace(synced.assets.clone());
    if let Some(changed) = changed {
        let assets = world.resource::<bevy::asset::AssetServer>();
        for path in changed {
            let path = bevy::asset::AssetPath::from(path);
            if assets.get_path_id(path.clone()).is_some() {
                assets.reload(path);
            }
        }
    }
    world.insert_resource(content.built::<quest::Parties>().clone());
    world.insert_resource(content.built::<script::RiftScripts>().clone());
    world.insert_resource(content.built::<GameSettings>().clone());
    world.insert_resource(ui::FontFiles(interface::font_files(&content)));
    world.insert_resource(input::map::InputMap::new(&content));
    world.insert_resource(content);
    world.insert_resource(synced);
    Ok(())
}

pub fn registry() -> ContentRegistry {
    use crate::core::content::LoadStep;
    let mut registry = ContentRegistry::default();
    registry
        .row::<crate::core::audio::playback::SfxDef>()
        .row::<attention::AttentionDef>()
        .row::<input::map::InputDef>()
        .row::<interface::CursorDef>()
        .row::<interface::FontDef>()
        .row::<interface::InterfaceIconDef>()
        .row::<item::ItemDef>()
        .modules::<item::ItemDef>()
        .row::<job::JobDef>()
        .row::<memory::MemoryDef>()
        .row::<notification::NotificationDef>()
        .row::<npc::NpcDef>()
        .modules::<npc::NpcDef>()
        .row::<player::PlayerDef>()
        .modules::<player::PlayerDef>()
        .row::<quest::QuestDef>()
        .modules::<quest::QuestDef>()
        .row::<script::ScriptDef>()
        .row::<shop::ShopDef>()
        .modules::<shop::ShopDef>()
        .fixture::<input::map::InputAction>()
        .fixture::<attention::AttentionMark>()
        .fixture::<interface::InterfaceSound>()
        .fixture::<interface::CursorShape>()
        .fixture::<interface::InterfaceIcon>()
        .fixture::<interface::FontFace>()
        .settings::<GameSettings>()
        .hook(LoadStep::Files, crate::core::content::media::check_media);
    crate::core::babble::content(&mut registry);
    actor::content(&mut registry);
    area::content(&mut registry);
    registry
        .hook(LoadStep::Blueprints, script::build_all)
        .hook(LoadStep::Across, shop::check_all)
        .hook(LoadStep::Across, quest::check_all)
        .hook(LoadStep::Across, notification::check_all)
        .hook(LoadStep::Across, script::check_all)
        .hook(LoadStep::Settings, check_settings);
    registry
}

impl crate::core::content::Settings for GameSettings {
    fn content_version(&self) -> &crate::core::content::ContentVersion {
        &self.content_version
    }
}

fn check_settings(loading: &mut crate::core::content::Loading) {
    let content = loading.content();
    let settings = content.built::<GameSettings>();
    if let Err(problem) = area::check_place(&content, settings.spawn) {
        loading.json_error(
            "game.json",
            "/spawn",
            problem.rule,
            problem.found,
            problem.expected,
            problem.nearest,
        );
    }
}

pub(crate) fn requests<M: Message>(world: &mut World) -> Vec<FromClient<M>> {
    world
        .resource_mut::<Messages<FromClient<M>>>()
        .drain()
        .collect()
}

#[derive(Resource)]
struct ReplicationClock(u64);

fn advance_replication_clock(mut clock: ResMut<ReplicationClock>) {
    clock.0 = clock.0.wrapping_add(1);
}

fn on_replication_tick(clock: Res<ReplicationClock>) -> bool {
    clock.0.is_multiple_of(REPLICATION_INTERVAL)
}
