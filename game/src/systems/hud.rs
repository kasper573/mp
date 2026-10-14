use std::collections::HashSet;
use std::hash::{BuildHasher, BuildHasherDefault, DefaultHasher, Hash};

use bevy::prelude::*;
use ui::{Geom, OnSettle, OnTap, text_colored, widget};

use crate::core::content::{Content, Fixture};
use crate::core::math::{Pos, Size, WindowPx};
use crate::systems::input::map::{ActionInput, InputAction};
use crate::systems::interface::InterfaceIcon;
use crate::systems::screen::{ClientScreen, despawn_all, mode::ClientMode};
use crate::systems::settings::{self, Placement, UserSettings};
use crate::systems::{equipment, history, item, player, quest, spectate, stat, terminal};

pub(crate) const WIDGET: WindowPx = WindowPx(48.0);
const WINDOW_SIZE: Vec2 = Vec2::new(400.0, 200.0);

pub(crate) const PANEL_BG: Color = Color::srgb(0.1, 0.1, 0.1);
pub(crate) const BORDER: Color = Color::srgb(0.31, 0.31, 0.31);
const TOOLTIP_BG: Color = Color::BLACK;

pub struct HudPlugin;

impl Plugin for HudPlugin {
    fn build(&self, app: &mut App) {
        settings::plugin(app);
        app.init_resource::<Open>()
            .init_resource::<RefreshWindows>()
            .add_systems(OnEnter(ClientScreen::Area), spawn_hud)
            .add_systems(OnExit(ClientScreen::Area), despawn_all::<Hud>)
            .add_systems(
                Update,
                (
                    toggle_keys.run_if(not(ui::typing)),
                    rebuild_windows,
                    sync_widgets,
                    sync_windows,
                )
                    .run_if(in_state(ClientScreen::Area)),
            );
    }
}

#[derive(Resource, Default)]
pub(crate) struct RefreshWindows(pub HashSet<&'static str>);

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum HudAudience {
    Players,
    Spectators,
    Everyone,
}

impl HudAudience {
    fn includes(self, mode: ClientMode) -> bool {
        match self {
            HudAudience::Players => mode == ClientMode::Play,
            HudAudience::Spectators => mode == ClientMode::Spectate,
            HudAudience::Everyone => true,
        }
    }
}

pub trait Widget: Send + Sync {
    fn audience(&self) -> HudAudience;
    fn fallback(&self, screen_w: f32) -> Vec2;
    fn build(&self, pos: Vec2, id: &'static str) -> Box<dyn Scene>;
    fn sync(&self, world: &mut World);
}

pub trait Window: Send + Sync {
    fn audience(&self) -> HudAudience;
    fn title(&self) -> &'static str;
    fn toggle(&self) -> InputAction;
    fn icon(&self) -> InterfaceIcon;
    fn size(&self) -> Vec2 {
        WINDOW_SIZE
    }
    fn contents(&self, world: &World) -> Vec<ui::WindowContent>;
    fn tab(&self, _world: &World) -> usize {
        0
    }
    fn sync(&self, world: &mut World);
}

pub(crate) fn single_tab(title: &str, scene: impl Scene + 'static) -> Vec<ui::WindowContent> {
    vec![ui::WindowContent {
        title: title.into(),
        scene: Box::new(scene),
    }]
}

pub(crate) const SLOT: f32 = 36.0;
pub(crate) const SLOT_BG: Color = Color::srgb(0.14, 0.14, 0.14);
pub(crate) const SLOT_BORDER: Color = Color::srgb(0.24, 0.24, 0.24);

pub(crate) fn slot_node() -> Node {
    Node {
        width: Val::Px(SLOT),
        height: Val::Px(SLOT),
        margin: UiRect::all(Val::Px(1.0)),
        border: UiRect::all(Val::Px(1.0)),
        ..default()
    }
}

pub(crate) fn tooltip_label(text: impl Into<String>) -> impl Scene {
    bsn! {
        Node { padding: {UiRect::axes(Val::Px(6.0), Val::Px(3.0))} }
        BackgroundColor({TOOLTIP_BG})
        Pickable { should_block_lower: false, is_hoverable: false }
        Children [ @{text_colored(text.into(), Color::WHITE)} ]
    }
}

// Scenes built in code wait on no assets, so only a bug in one can keep it from spawning.
pub(crate) fn spawn_ui(world: &mut World, scene: impl Scene) -> EntityWorldMut<'_> {
    world
        .spawn_scene(scene)
        .unwrap_or_else(|error| panic!("{error}"))
}

pub(crate) fn fingerprint(value: &impl Hash) -> u64 {
    BuildHasherDefault::<DefaultHasher>::default().hash_one(value)
}

pub(crate) fn reconcile_children(
    world: &mut World,
    container: Entity,
    keys: &[impl Hash],
    build: impl Fn(&World, usize) -> Box<dyn Scene>,
) {
    let keys: Vec<u64> = keys.iter().map(fingerprint).collect();
    let current: Vec<(Entity, u64)> = world
        .get::<Children>(container)
        .map(|children| {
            children
                .iter()
                .filter_map(|child| world.get::<Keyed>(child).map(|keyed| (child, keyed.0)))
                .collect()
        })
        .unwrap_or_default();
    for (index, &key) in keys.iter().enumerate() {
        let have = current.get(index);
        if have.is_some_and(|&(_, have)| have == key) {
            continue;
        }
        if let Some(&(stale, _)) = have {
            world.entity_mut(stale).despawn();
        }
        let scene = build(world, index);
        let child = spawn_ui(world, scene).insert(Keyed(key)).id();
        world.entity_mut(container).insert_children(index, &[child]);
    }
    for &(extra, _) in current.iter().skip(keys.len()) {
        world.entity_mut(extra).despawn();
    }
}

#[derive(Component)]
struct Keyed(u64);

static WIDGETS: &[(&str, &dyn Widget)] = &[
    ("character", &player::widget::CharacterWidget),
    ("quests", &quest::tracker::QuestTrackerWidget),
    ("spectator", &spectate::widget::SpectatorWidget),
];

// Their launchers line up in this order.
static WINDOWS: &[&dyn Window] = &[
    &item::widget::InventoryWindow,
    &equipment::widget::EquipmentWindow,
    &stat::widget::StatsWindow,
    &quest::log::QuestLogWindow,
    &history::widget::HistoryWindow,
    &settings::SettingsWindow,
    &terminal::widget::TerminalWindow,
];

fn widgets(mode: ClientMode) -> impl Iterator<Item = (&'static str, &'static dyn Widget)> {
    WIDGETS
        .iter()
        .copied()
        .filter(move |(_, widget)| widget.audience().includes(mode))
}

fn windows(mode: ClientMode) -> impl Iterator<Item = &'static dyn Window> {
    WINDOWS
        .iter()
        .copied()
        .filter(move |window| window.audience().includes(mode))
}

fn window_def(title: &str) -> &'static dyn Window {
    WINDOWS
        .iter()
        .copied()
        .find(|window| window.title() == title)
        .expect("a registered window")
}

#[derive(Resource, Default)]
struct Open(HashSet<&'static str>);

#[derive(Component, Default, Clone)]
struct Hud;

#[derive(Component, Default, Clone)]
struct HudPiece;

#[derive(Component, Clone)]
struct WindowView {
    window: &'static str,
    open: bool,
}

fn spawn_hud(
    mut commands: Commands,
    mode: Res<ClientMode>,
    settings: Res<UserSettings>,
    assets: Res<AssetServer>,
    content: Res<Content>,
    screen: Single<&bevy::window::Window>,
) {
    let screen_w = screen.resolution.width();
    let mut scenes: Vec<Box<dyn Scene>> = Vec::new();
    for (name, widget) in widgets(*mode) {
        let pos = widget_pos(&settings, name, widget.fallback(screen_w));
        let built = widget.build(pos, name);
        scenes.push(Box::new(bsn! { @{built} HudPiece }));
    }
    for window in windows(*mode) {
        scenes.push(Box::new(launcher(
            window.title(),
            *mode,
            screen_w,
            &settings,
            &assets,
            &content,
        )));
    }
    commands.spawn_scene(bsn! {
        Hud
        Node { width: Val::Percent(100.0), height: Val::Percent(100.0) }
        Pickable { should_block_lower: false, is_hoverable: false }
        Children [ {scenes} ]
    });
}

fn rebuild_windows(world: &mut World) {
    let refresh = if world.resource::<RefreshWindows>().0.is_empty() {
        HashSet::new()
    } else {
        std::mem::take(&mut world.resource_mut::<RefreshWindows>().0)
    };
    if !world.is_resource_changed::<Open>() && refresh.is_empty() {
        return;
    }
    let Ok(screen) = world
        .query::<&bevy::window::Window>()
        .single(world)
        .map(|screen| screen.resolution.size())
    else {
        return;
    };
    let views: Vec<(Entity, WindowView, Entity)> = world
        .query::<(Entity, &WindowView, &ChildOf)>()
        .iter(world)
        .map(|(entity, view, child_of)| (entity, view.clone(), child_of.parent()))
        .collect();
    for (entity, view, hud) in views {
        let should_open = world.resource::<Open>().0.contains(&view.window);
        if should_open == view.open && !(view.open && refresh.contains(&view.window)) {
            continue;
        }
        let window = view.window;
        let panel: Box<dyn Scene> = if should_open {
            Box::new(window_scene(world, window, screen))
        } else {
            let mode = *world.resource::<ClientMode>();
            let settings = world.resource::<UserSettings>();
            let assets = world.resource::<AssetServer>();
            let content = world.resource::<Content>();
            Box::new(launcher(window, mode, screen.x, settings, assets, content))
        };
        world.entity_mut(entity).despawn();
        spawn_ui(world, panel).insert(ChildOf(hud));
    }
}

fn sync_widgets(world: &mut World) {
    for (_, widget) in widgets(*world.resource::<ClientMode>()) {
        widget.sync(world);
    }
}

fn launcher(
    window: &'static str,
    mode: ClientMode,
    screen_w: f32,
    settings: &UserSettings,
    assets: &AssetServer,
    content: &Content,
) -> impl Scene {
    let def = window_def(window);
    let pos = widget_pos(settings, window, launcher_pos(window, mode, screen_w));
    bsn! {
        @{widget(ui::WidgetOptions {
            pos,
            icon: assets.load(def.icon().get(content).image.path()),
            badge: Some(def.toggle().into()),
            tooltip: def.title().to_owned(),
            on_tap: OnTap::new(move |world| open_window(world, window)),
            on_settle: OnSettle::new(move |world, geom| persist_widget(world, window, geom)),
        })}
        ~{WindowView { window, open: false }}
        HudPiece
    }
}

fn window_scene(world: &World, window: &'static str, screen: Vec2) -> impl Scene {
    let def = window_def(window);
    let centered = ((screen - def.size()) / 2.0).max(Vec2::splat(8.0));
    bsn! {
        @{placed_window(
            world,
            window,
            (centered, def.size()),
            OnTap::new(move |world| {
                close_window(world, window);
            }),
            def.contents(world),
            def.tab(world),
        )}
        ~{WindowView { window, open: true }}
    }
}

pub(crate) fn pieces(world: &mut World) -> Vec<Rect> {
    let pieces: Vec<Entity> = world
        .query_filtered::<(Entity, &InheritedVisibility), With<HudPiece>>()
        .iter(world)
        .filter(|(_, visibility)| visibility.get())
        .map(|(piece, _)| piece)
        .collect();
    pieces
        .into_iter()
        .filter_map(|piece| ui::node_rect(world, piece))
        .filter(|rect| rect.width() > 0.0 && rect.height() > 0.0)
        .collect()
}

pub(crate) fn spawn_in_hud(world: &mut World, scene: impl Scene) -> Option<Entity> {
    let hud = world
        .query_filtered::<Entity, With<Hud>>()
        .iter(world)
        .next()?;
    Some(spawn_ui(world, scene).insert(ChildOf(hud)).id())
}

pub(crate) fn placed_window(
    world: &World,
    id: &'static str,
    (fallback_pos, fallback_size): (Vec2, Vec2),
    on_close: OnTap,
    content: Vec<ui::WindowContent>,
    tab: usize,
) -> impl Scene + use<> {
    let settings = world.resource::<UserSettings>();
    let (pos, size) = window_geom(settings, id, fallback_pos, fallback_size);
    ui::window(ui::WindowOptions {
        pos,
        size,
        on_close,
        on_settle: OnSettle::new(move |world, geom| persist_window(world, id, geom)),
        content,
        tab,
    })
}

pub(crate) fn close_window(world: &mut World, window: &'static str) -> bool {
    world.resource_mut::<Open>().0.remove(&window)
}

pub(crate) fn window_open(world: &World, window: &'static str) -> bool {
    world.resource::<Open>().0.contains(&window)
}

pub(crate) fn close_topmost_window(world: &mut World) -> bool {
    let open: Vec<Entity> = world
        .query::<(Entity, &WindowView)>()
        .iter(world)
        .filter(|(_, view)| view.open)
        .map(|(entity, _)| entity)
        .collect();
    let Some(topmost) = ui::topmost(world, open) else {
        return false;
    };
    let window = world.get::<WindowView>(topmost).map(|view| view.window);
    if let Some(window) = window {
        close_window(world, window);
    }
    window.is_some()
}

fn sync_windows(world: &mut World) {
    for window in windows(*world.resource::<ClientMode>()) {
        window.sync(world);
    }
}

fn widget_pos(settings: &UserSettings, id: &str, fallback: Vec2) -> Vec2 {
    settings
        .widget_pos(id)
        .map_or(fallback, |pos| Vec2::new(pos.x, pos.y))
}

fn window_geom(
    settings: &UserSettings,
    id: &str,
    fallback_pos: Vec2,
    fallback_size: Vec2,
) -> (Vec2, Vec2) {
    settings
        .window_placement(id)
        .map_or((fallback_pos, fallback_size), |placement| {
            (
                Vec2::new(placement.pos.x, placement.pos.y),
                Vec2::new(placement.size.width, placement.size.height),
            )
        })
}

pub(crate) fn persist_widget(world: &mut World, id: &str, geom: Geom) -> Geom {
    world
        .resource_mut::<UserSettings>()
        .set_widget_pos(id, Pos::new(geom.pos.x, geom.pos.y));
    geom
}

fn persist_window(world: &mut World, id: &str, geom: Geom) -> Geom {
    world.resource_mut::<UserSettings>().set_window_placement(
        id,
        Placement {
            pos: Pos::new(geom.pos.x, geom.pos.y),
            size: Size::new(geom.size.x, geom.size.y),
        },
    );
    geom
}

fn launcher_pos(window: &'static str, mode: ClientMode, screen_w: f32) -> Vec2 {
    let slot = windows(mode)
        .position(|other| other.title() == window)
        .expect("a window shown in this mode");
    Vec2::new(
        screen_w - 8.0 - WIDGET.0,
        8.0 + slot as f32 * (WIDGET.0 + 8.0),
    )
}

fn open_window(world: &mut World, window: &'static str) {
    world.resource_mut::<Open>().0.insert(window);
}

fn toggle_keys(input: ActionInput, mode: Res<ClientMode>, mut open: ResMut<Open>) {
    for window in windows(*mode) {
        let title = window.title();
        if input.just_pressed(window.toggle()) && !open.0.remove(title) {
            open.0.insert(title);
        }
    }
}
