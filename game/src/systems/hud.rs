use std::collections::{HashMap, HashSet};

use bevy::prelude::*;
use bevy_egui::EguiPrimaryContextPass;
use bevy_egui::input::egui_wants_any_keyboard_input;
use design_tokens::{HAIRLINE, SHADOW, TextRole, WINDOW_RADIUS, color, widgets};
use egui::{Id, LayerId, Pos2, Rect, Ui, Vec2};

use crate::core::assets::AssetRef;
use crate::core::content::{Content, Fixture};
use crate::core::gui::{self, Band};
use crate::core::math::{Pos, Size, WindowPx};
use crate::core::text::{self, StyledLine, TextLook};
use crate::systems::input::map::{ActionInput, InputAction, InputMap};
use crate::systems::interface::InterfaceIcon;
use crate::systems::screen::{ClientScreen, mode::ClientMode};
use crate::systems::settings::{self, Placement, UserSettings};
use crate::systems::{equipment, history, item, player, quest, spectate, stat, terminal};

pub(crate) const WIDGET: WindowPx = WindowPx(48.0);
const WINDOW_SIZE: Vec2 = Vec2::new(400.0, 200.0);
const MIN_WINDOW: Vec2 = Vec2::new(100.0, 100.0);
const LAUNCHER_ICON: f32 = 32.0;
const MARGIN: f32 = 8.0;
const TOOLTIP_WIDTH: f32 = 260.0;

pub struct HudPlugin;

impl Plugin for HudPlugin {
    fn build(&self, app: &mut App) {
        settings::plugin(app);
        app.init_resource::<Open>()
            .init_resource::<WindowGenerations>()
            .init_resource::<WindowsDrawn>()
            .init_resource::<HudDrawn>()
            .init_resource::<Confirming>()
            .add_systems(
                Update,
                toggle_keys
                    .run_if(not(egui_wants_any_keyboard_input))
                    .run_if(in_state(ClientScreen::Area)),
            )
            .add_systems(
                EguiPrimaryContextPass,
                (
                    forget_drawn.before(Band::Stage),
                    draw_hud
                        .in_set(Band::Hud)
                        .run_if(in_state(ClientScreen::Area)),
                    draw_confirm.in_set(Band::Modal),
                ),
            );
    }
}

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
    fn fallback(&self, screen: Rect) -> Pos2;
    fn show(&self, ui: &mut Ui, world: &mut World);
}

pub trait Window: Send + Sync {
    fn audience(&self) -> HudAudience;
    fn title(&self) -> &'static str;
    fn toggle(&self) -> InputAction;
    fn icon(&self) -> InterfaceIcon;
    fn size(&self) -> Vec2 {
        WINDOW_SIZE
    }
    fn show(&self, ui: &mut Ui, world: &mut World);
}

pub(crate) struct Confirm {
    pub title: String,
    pub body: Vec<String>,
    pub confirm: String,
    pub cancel: String,
    pub on_confirm: Box<dyn FnOnce(&mut World) + Send + Sync>,
}

#[derive(Clone, Debug)]
pub struct WindowTitle {
    pub title: String,
    pub rect: Rect,
}

pub(crate) fn panel() -> egui::Frame {
    egui::Frame::new()
        .fill(color::PANEL)
        .stroke(HAIRLINE)
        .corner_radius(WINDOW_RADIUS)
        .shadow(SHADOW)
        .inner_margin(MARGIN)
}

pub(crate) fn icon(ui: &mut Ui, world: &mut World, asset: &AssetRef, size: f32) -> egui::Response {
    sized(ui, gui::image(world, asset), size)
}

pub(crate) fn confirm(world: &mut World, confirm: Confirm) {
    world.resource_mut::<Confirming>().0 = Some(Pending {
        confirm,
        focused: false,
    });
}

pub(crate) fn confirming(world: &World) -> bool {
    world.resource::<Confirming>().0.is_some()
}

pub(crate) fn dismiss_confirm(world: &mut World) -> bool {
    world.resource_mut::<Confirming>().0.take().is_some()
}

pub(crate) fn close_window(world: &mut World, window: &'static str) -> bool {
    world.resource_mut::<Open>().0.remove(&window)
}

pub(crate) fn window_open(world: &World, window: &'static str) -> bool {
    world.resource::<Open>().0.contains(&window)
}

pub(crate) fn just_opened(world: &World, window: &'static str) -> bool {
    !world.resource::<WindowsDrawn>().last.contains(window)
}

pub(crate) fn close_topmost_window(world: &mut World) -> bool {
    let Some(gui) = gui::context(world) else {
        return false;
    };
    let open: HashMap<LayerId, &'static str> = world
        .resource::<Open>()
        .0
        .iter()
        .map(|&title| (window_layer(world, title), title))
        .collect();
    let topmost = gui.memory(|memory| {
        memory
            .layer_ids()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .find_map(|layer| open.get(&layer).copied())
    });
    topmost.is_some_and(|title| close_window(world, title))
}

pub(crate) fn pieces(world: &World) -> Vec<Rect> {
    world.resource::<HudDrawn>().0.clone()
}

pub fn window_titles(world: &World) -> Vec<WindowTitle> {
    world.resource::<WindowsDrawn>().titles.clone()
}

pub(crate) fn movable<R>(
    world: &mut World,
    gui: &egui::Context,
    id: &str,
    fallback: Pos2,
    add: impl FnOnce(&mut Ui, &mut World) -> R,
) -> egui::InnerResponse<R> {
    let at = world
        .resource::<UserSettings>()
        .widget_pos(id)
        .map_or(fallback, |pos| Pos2::new(pos.x, pos.y));
    let area = egui::Area::new(Id::new(("hud", id)))
        .order(Band::Hud.order())
        .movable(true)
        .constrain(true);
    let area = if pointer_busy(gui) {
        area.default_pos(at)
    } else {
        area.current_pos(at)
    };
    let shown = area.show(gui, |ui| add(ui, world));
    if shown.response.drag_stopped() {
        let snapped = snap_pos(world, shown.response.rect.min);
        world
            .resource_mut::<UserSettings>()
            .set_widget_pos(id, Pos::new(snapped.x, snapped.y));
    }
    world.resource_mut::<HudDrawn>().0.push(shown.response.rect);
    shown
}

pub(crate) fn placed_window<R>(
    world: &mut World,
    gui: &egui::Context,
    title: &'static str,
    size: Vec2,
    open: &mut bool,
    add: impl FnOnce(&mut Ui, &mut World) -> R,
) -> Option<egui::InnerResponse<Option<R>>> {
    let screen = gui.content_rect();
    let centered = Rect::from_min_size(
        (screen.center() - size / 2.0).max(Pos2::new(MARGIN, MARGIN)),
        size,
    );
    keyed_window(
        world,
        gui,
        WindowShape {
            key: title,
            title,
            fallback: centered,
            height: WindowHeight::Resizable,
        },
        open,
        add,
    )
}

pub(crate) struct WindowShape<'a> {
    pub key: &'static str,
    pub title: &'a str,
    pub fallback: Rect,
    pub height: WindowHeight,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum WindowHeight {
    Resizable,
    FitsContent,
}

pub(crate) fn keyed_window<R>(
    world: &mut World,
    gui: &egui::Context,
    shape: WindowShape,
    open: &mut bool,
    add: impl FnOnce(&mut Ui, &mut World) -> R,
) -> Option<egui::InnerResponse<Option<R>>> {
    let WindowShape {
        key,
        title,
        fallback,
        height,
    } = shape;
    let id = window_id(world, key);
    let placement = world
        .resource::<UserSettings>()
        .window_placement(key)
        .map(placed_rect);
    let default = placement.unwrap_or(fallback);
    let default = match height {
        WindowHeight::Resizable => default,
        // egui lets content grow only as tall as the window first stood, which a placement
        // saved from shorter content would cut short.
        WindowHeight::FitsContent => {
            Rect::from_min_size(default.min, Vec2::new(default.width(), fallback.height()))
        }
    };
    let window = egui::Window::new(title)
        .id(id)
        .open(open)
        .min_size(MIN_WINDOW)
        .default_rect(default)
        .resizable([true, height == WindowHeight::Resizable])
        .constrain(true);
    let window = match placement {
        Some(placed) if !pointer_busy(gui) => window.current_pos(placed.min),
        _ => window,
    };
    let shown = window.show(gui, |ui| add(ui, world))?;
    let rect = shown.response.rect;
    settle(world, gui, key, id, rect, placement);
    if let Some(bar) = gui.read_response(id.with("__title_click")) {
        world
            .resource_mut::<WindowsDrawn>()
            .titles
            .push(WindowTitle {
                title: title.to_owned(),
                rect: bar.rect,
            });
    }
    world.resource_mut::<WindowsDrawn>().now.insert(key);
    world.resource_mut::<HudDrawn>().0.push(rect);
    Some(shown)
}

pub(crate) fn tooltip(
    ui: &mut Ui,
    world: &World,
    title: &str,
    lines: &[String],
    hint: Option<&StyledLine>,
) {
    ui.set_max_width(TOOLTIP_WIDTH);
    ui.label(
        egui::RichText::new(title)
            .family(design_tokens::family::medium())
            .color(color::TEXT),
    );
    for line in lines {
        ui.label(
            egui::RichText::new(line)
                .size(TextRole::Small.size())
                .color(color::TEXT.gamma_multiply(0.85)),
        );
    }
    if let Some(hint) = hint {
        let look = TextLook {
            size: TextRole::Small.size(),
            color: color::MUTED,
        };
        text::show(ui, world, hint, look, None);
    }
}

pub(crate) fn file_icon(ui: &mut Ui, world: &mut World, file: &str, size: f32) -> egui::Response {
    sized(ui, gui::image_file(world, file), size)
}

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

#[derive(Resource, Default)]
struct Open(HashSet<&'static str>);

/// Bumped to impose a snapped size: egui keeps a window's size to itself, so only a window it
/// hasn't seen yet takes the size it is given.
#[derive(Resource, Default)]
struct WindowGenerations(HashMap<&'static str, u32>);

#[derive(Resource, Default)]
struct WindowsDrawn {
    last: HashSet<&'static str>,
    now: HashSet<&'static str>,
    titles: Vec<WindowTitle>,
    at_press: HashMap<&'static str, Rect>,
}

#[derive(Resource, Default)]
struct HudDrawn(Vec<Rect>);

#[derive(Resource, Default)]
struct Confirming(Option<Pending>);

struct Pending {
    confirm: Confirm,
    focused: bool,
}

fn forget_drawn(mut drawn: ResMut<WindowsDrawn>, mut hud: ResMut<HudDrawn>) {
    let drawn = &mut *drawn;
    drawn.last = std::mem::take(&mut drawn.now);
    drawn.titles.clear();
    hud.0.clear();
}

fn draw_hud(world: &mut World) {
    let Some(gui) = gui::context(world) else {
        return;
    };
    let mode = *world.resource::<ClientMode>();
    let screen = gui.content_rect();
    for (name, widget) in widgets(mode) {
        movable(world, &gui, name, widget.fallback(screen), |ui, world| {
            widget.show(ui, world);
        });
    }
    for (slot, window) in windows(mode).enumerate() {
        let title = window.title();
        if !window_open(world, title) {
            launcher(world, &gui, window, launcher_pos(slot, screen));
            continue;
        }
        let mut open = true;
        placed_window(world, &gui, title, window.size(), &mut open, |ui, world| {
            window.show(ui, world);
        });
        if !open {
            close_window(world, title);
        }
    }
}

fn launcher(world: &mut World, gui: &egui::Context, window: &'static dyn Window, at: Pos2) {
    let title = window.title();
    let image = window.icon().get(world.resource::<Content>()).image.clone();
    let key = world
        .resource::<InputMap>()
        .name(window.toggle())
        .unwrap_or_default();
    let shown = movable(world, gui, title, at, |ui, world| {
        let response = ui.add(egui::Button::new("").min_size(Vec2::splat(WIDGET.0)));
        if let Some(icon) = gui::image(world, &image) {
            let at = Rect::from_center_size(response.rect.center(), Vec2::splat(LAUNCHER_ICON));
            ui.put(at, icon.widget(Vec2::splat(LAUNCHER_ICON)));
        }
        key_badge(ui, response.rect, &key);
        response.on_hover_text(title)
    });
    if shown.inner.clicked() {
        world.resource_mut::<Open>().0.insert(title);
    }
}

fn key_badge(ui: &Ui, button: Rect, key: &str) {
    let font = egui::FontId::monospace(10.0);
    let galley = ui
        .painter()
        .layout_no_wrap(key.to_owned(), font, color::MUTED);
    let size = galley.size() + Vec2::new(6.0, 2.0);
    let rect = Rect::from_min_size(button.right_bottom() - size - Vec2::splat(2.0), size);
    ui.painter()
        .rect(rect, 3.0, color::INPUT, HAIRLINE, egui::StrokeKind::Inside);
    ui.painter()
        .galley(rect.center() - galley.size() / 2.0, galley, color::MUTED);
}

fn draw_confirm(world: &mut World) {
    let Some(gui) = gui::context(world) else {
        return;
    };
    let Some(mut pending) = world.resource_mut::<Confirming>().0.take() else {
        return;
    };
    let keep_key = world
        .resource::<InputMap>()
        .shortcut(InputAction::TakeDefault);
    let mut decided = None;
    let modal = egui::Modal::new(Id::new("confirm")).show(&gui, |ui| {
        ui.set_max_width(360.0);
        ui.heading(&pending.confirm.title);
        ui.add_space(4.0);
        for line in &pending.confirm.body {
            ui.label(line);
        }
        ui.add_space(10.0);
        ui.horizontal(|ui| {
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                let keep = ui.button(&pending.confirm.cancel);
                if !pending.focused {
                    keep.request_focus();
                    pending.focused = true;
                }
                if widgets::danger(ui, &pending.confirm.confirm).clicked() {
                    decided = Some(true);
                }
                let keep_pressed =
                    keep_key.is_some_and(|key| ui.input_mut(|i| i.consume_shortcut(&key)));
                if keep.clicked() || keep_pressed {
                    decided = Some(false);
                }
            });
        });
    });
    if modal.should_close() && decided.is_none() {
        decided = Some(false);
    }
    match decided {
        Some(true) => (pending.confirm.on_confirm)(world),
        Some(false) => {}
        None => world.resource_mut::<Confirming>().0 = Some(pending),
    }
}

fn settle(
    world: &mut World,
    gui: &egui::Context,
    title: &'static str,
    id: Id,
    rect: Rect,
    placement: Option<Rect>,
) {
    let (pressed, released) =
        gui.input(|input| (input.pointer.any_pressed(), input.pointer.any_released()));
    if pressed {
        world
            .resource_mut::<WindowsDrawn>()
            .at_press
            .insert(title, rect);
    }
    let Some(placed) = placement else {
        persist_window(world, title, rect);
        return;
    };
    if !released {
        return;
    }
    let Some(before) = world.resource_mut::<WindowsDrawn>().at_press.remove(title) else {
        return;
    };
    if before == rect {
        return;
    }
    let collapsed = egui::collapsing_header::CollapsingState::load(gui, id.with("collapsing"))
        .is_some_and(|state| !state.is_open());
    let resized = !collapsed && (rect.size() - before.size()).length() > 0.5;
    let settled = if resized {
        let size = snap_size(world, rect.size()).max(MIN_WINDOW);
        if size != rect.size() {
            *world
                .resource_mut::<WindowGenerations>()
                .0
                .entry(title)
                .or_default() += 1;
        }
        Rect::from_min_size(rect.min, size)
    } else {
        Rect::from_min_size(snap_pos(world, rect.min), placed.size())
    };
    persist_window(world, title, settled);
}

fn persist_window(world: &mut World, title: &str, rect: Rect) {
    world.resource_mut::<UserSettings>().set_window_placement(
        title,
        Placement {
            pos: Pos::new(rect.min.x, rect.min.y),
            size: Size::new(rect.width(), rect.height()),
        },
    );
}

fn placed_rect(placement: Placement) -> Rect {
    Rect::from_min_size(
        Pos2::new(placement.pos.x, placement.pos.y),
        Vec2::new(placement.size.width, placement.size.height),
    )
}

fn window_id(world: &World, title: &'static str) -> Id {
    let generation = world
        .resource::<WindowGenerations>()
        .0
        .get(title)
        .copied()
        .unwrap_or_default();
    Id::new(("window", title, generation))
}

fn window_layer(world: &World, title: &'static str) -> LayerId {
    LayerId::new(Band::Hud.order(), window_id(world, title))
}

fn snap_pos(world: &World, pos: Pos2) -> Pos2 {
    let snap = snapper(world);
    Pos2::new(snap(pos.x), snap(pos.y))
}

fn snap_size(world: &World, size: Vec2) -> Vec2 {
    let snap = snapper(world);
    Vec2::new(snap(size.x), snap(size.y))
}

fn snapper(world: &World) -> impl Fn(f32) -> f32 {
    let grid = world.resource::<UserSettings>().snap().map(|grid| grid.0);
    move |value| match grid {
        Some(grid) => (value / grid).round() * grid,
        None => value,
    }
}

// While the pointer is down a piece may be on the move, and egui knows best where it is.
fn pointer_busy(gui: &egui::Context) -> bool {
    gui.input(|input| input.pointer.any_down() || input.pointer.any_released())
}

fn launcher_pos(slot: usize, screen: Rect) -> Pos2 {
    Pos2::new(
        screen.right() - MARGIN - WIDGET.0,
        screen.top() + MARGIN + slot as f32 * (WIDGET.0 + MARGIN),
    )
}

fn toggle_keys(input: ActionInput, mode: Res<ClientMode>, mut open: ResMut<Open>) {
    for window in windows(*mode) {
        let title = window.title();
        if input.just_pressed(window.toggle()) && !open.0.remove(title) {
            open.0.insert(title);
        }
    }
}

fn sized(ui: &mut Ui, image: Option<gui::GuiImage>, size: f32) -> egui::Response {
    match image {
        Some(image) => ui.add(image.widget(Vec2::splat(size))),
        None => {
            ui.allocate_exact_size(Vec2::splat(size), egui::Sense::hover())
                .1
        }
    }
}
