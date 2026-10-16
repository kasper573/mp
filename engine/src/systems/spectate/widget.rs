use bevy::prelude::*;
use bevy_egui::EguiPrimaryContextPass;
use bevy_egui::input::egui_wants_any_keyboard_input;
use design_tokens::{TextRole, color};
use egui::{Align, Id, Layout, Pos2, Rect, RichText, Ui};

use super::{SpectateRequest, Spectating};
use crate::core::gui::{self, Band};
use crate::core::text::{self, StyledLine, TextLook, TextPiece};
use crate::systems::actor::Name;
use crate::systems::hud::{self, HudAudience, HudWidget};
use crate::systems::input::map::{self, InputAction};
use crate::systems::player::session::{self, ClientMode, SpectateStatus, Viewpoint};
use crate::systems::screen::ClientScreen;

const BLANK: egui::Color32 = egui::Color32::from_rgb(18, 18, 18);
const MIN_WIDTH: f32 = 180.0;

pub struct SpectatorPlugin;

impl Plugin for SpectatorPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            Update,
            step_keys
                .run_if(not(egui_wants_any_keyboard_input))
                .run_if(in_state(ClientScreen::Area))
                .run_if(session::in_mode(ClientMode::Spectate)),
        )
        .add_systems(
            EguiPrimaryContextPass,
            nobody_playing
                .in_set(Band::World)
                .run_if(in_state(ClientScreen::Area))
                .run_if(session::in_mode(ClientMode::Spectate)),
        );
    }
}

pub struct SpectatorWidget;

impl HudWidget for SpectatorWidget {
    fn audience(&self) -> HudAudience {
        HudAudience::Spectators
    }
    fn fallback(&self, screen: Rect) -> Pos2 {
        screen.min + egui::vec2(8.0, 8.0)
    }
    fn show(&self, ui: &mut Ui, world: &mut World) {
        let (watched, place) = panel_text(world);
        hud::panel().show(ui, |ui| {
            ui.set_min_width(MIN_WIDTH);
            ui.label(watched);
            ui.horizontal(|ui| {
                if ui.button("<").clicked() {
                    world.write_message(SpectateRequest::Previous);
                }
                ui.label(place);
                if ui.button(">").clicked() {
                    world.write_message(SpectateRequest::Next);
                }
            });
            let look = TextLook {
                size: TextRole::Small.size(),
                color: color::MUTED,
            };
            text::show(ui, world, &switch_hint(), look, None);
            if ui
                .button("Exit")
                .on_hover_text("Back to your character")
                .clicked()
            {
                world.write_message(SpectateRequest::Stop);
            }
        });
    }
}

fn switch_hint() -> StyledLine {
    StyledLine::new(vec![
        map::input(InputAction::SpectatePrevious),
        map::input(InputAction::SpectateNext),
        TextPiece::text(" to switch"),
    ])
}

fn step_keys(world: &mut World) {
    let request = if map::just_pressed(world, InputAction::SpectateNext) {
        SpectateRequest::Next
    } else if map::just_pressed(world, InputAction::SpectatePrevious) {
        SpectateRequest::Previous
    } else {
        return;
    };
    world.write_message(request);
}

fn panel_text(world: &World) -> (String, String) {
    match world.resource::<SpectateStatus>().0 {
        None | Some(Spectating::Stopped) => (String::new(), String::new()),
        Some(Spectating::Nobody) => ("Nobody is playing".to_owned(), String::new()),
        Some(Spectating::Player(watched)) => {
            let name = world
                .resource::<Viewpoint>()
                .0
                .and_then(|seen| world.get::<Name>(seen));
            (
                name.map_or_else(
                    || "Watching".to_owned(),
                    |name| format!("Watching {}", name.name),
                ),
                format!("{} of {}", watched.place, watched.online),
            )
        }
    }
}

// Without a player to watch there is nothing of the world to see, so none of it shows.
fn nobody_playing(world: &mut World) {
    if world.resource::<SpectateStatus>().0 != Some(Spectating::Nobody) {
        return;
    }
    let Some(gui) = gui::context(world) else {
        return;
    };
    let screen = gui.content_rect();
    egui::Area::new(Id::new("nobody playing"))
        .order(Band::World.order())
        .fixed_pos(screen.min)
        .interactable(false)
        .show(&gui, |ui| {
            ui.painter().rect_filled(screen, 0.0, BLANK);
            ui.allocate_ui_with_layout(screen.size(), Layout::top_down(Align::Center), |ui| {
                ui.set_min_size(screen.size());
                ui.add_space(screen.height() / 2.0 - 24.0);
                ui.label(RichText::new("Nobody is playing right now").color(color::TEXT));
                ui.label(
                    RichText::new("Spectating starts as soon as someone joins").color(color::MUTED),
                );
            });
        });
}
