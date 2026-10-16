pub mod area;
pub mod connection;
pub mod loading;
pub mod mode;

use bevy::prelude::*;
use design_tokens::{TextRole, color};
use egui::{RichText, TextStyle, Ui};
use renet2::RenetClient;

use crate::core::gui::{self, Band};
use crate::core::math::Rng;
use crate::core::time::{Backoff, Seconds};
use crate::systems::player::{JoinRequest, session};
use crate::systems::spectate::SpectateRequest;
use connection::{Announce, PendingSession};

const NOTICE_WIDTH: f32 = 320.0;
// The most lines a load shows on its way, so the notice keeps one height as the screens and their
// lines come and go. Notes and a failure are rare, and grow it instead.
const NOTICE_LINES: usize = 4;
const LINE_GAP: f32 = 4.0;

const SERVER_RETRY: Backoff = Backoff {
    first: Seconds(1.0),
    longest: Seconds(30.0),
};

/// How many tries at the server have failed in a row, and when the next one is due. A due time of
/// `None` means the next try waits for the player.
#[derive(Resource, Clone, Copy, Debug, Default, PartialEq)]
pub struct Retry {
    pub failures: u32,
    pub due: Option<Seconds>,
}

impl Retry {
    pub fn failed(self, now: Seconds, rng: &mut Rng) -> Retry {
        let failures = self.failures + 1;
        Retry {
            failures,
            due: Some(now + SERVER_RETRY.after(failures, rng)),
        }
    }

    pub fn is_due(self, now: Seconds) -> bool {
        self.due.is_some_and(|due| now >= due)
    }
}

#[derive(States, Default, Clone, PartialEq, Eq, Hash, Debug)]
pub enum ClientScreen {
    #[default]
    Loading,
    ChoosingMode,
    Connecting,
    Lost,
    Area,
}

pub struct ClientScreenPlugin {
    pub spectator: bool,
}

impl Plugin for ClientScreenPlugin {
    fn build(&self, app: &mut App) {
        app.init_state::<ClientScreen>()
            .insert_resource(loading::AfterLoading(if self.spectator {
                ClientScreen::ChoosingMode
            } else {
                ClientScreen::Connecting
            }))
            .add_plugins((
                loading::LoadingPlugin,
                mode::ClientModePlugin,
                connection::ConnectionPlugin,
                area::AreaPlugin,
            ))
            .add_systems(Update, (connection::poll_session, drive, announce).chain());
    }
}

fn drive(
    pending: Option<Res<PendingSession>>,
    client: Option<Res<RenetClient>>,
    scene: Res<State<ClientScreen>>,
    mut next: ResMut<NextState<ClientScreen>>,
) {
    if matches!(
        scene.get(),
        ClientScreen::ChoosingMode | ClientScreen::Loading
    ) || !matches!(*next, NextState::Unchanged)
    {
        return;
    }
    let connected = client.as_ref().is_some_and(|client| client.is_connected());
    let attempting =
        pending.is_some() || client.as_ref().is_some_and(|client| client.is_connecting());
    let target = if connected {
        ClientScreen::Area
    } else if attempting {
        ClientScreen::Connecting
    } else {
        ClientScreen::Lost
    };
    if *scene.get() != target {
        next.set(target);
    }
}

fn announce(world: &mut World) {
    if world.get_resource::<Announce>().is_none() || session::my_id(world).is_none() {
        return;
    }
    let spectate = world.resource::<Announce>().spectate;
    info!(
        "connection welcomed; announcing {}",
        if spectate { "spectate" } else { "join" }
    );
    if spectate {
        world.write_message(SpectateRequest::Start);
    } else {
        world.write_message(JoinRequest);
    }
    world.remove_resource::<Announce>();
}

/// What a screen between screens says, always in one panel.
pub(crate) struct Notice<'a> {
    pub title: &'a str,
    pub lines: &'a [String],
    pub notes: &'a [String],
    pub action: Option<&'a str>,
}

/// Returns whether the notice's action was taken.
pub(crate) fn notice_screen(
    gui: &egui::Context,
    id: &str,
    backdrop: Option<egui::Color32>,
    notice: Notice,
) -> bool {
    system_screen(gui, id, backdrop, |ui| notice_panel(ui, notice)).inner
}

pub(crate) fn system_screen<R>(
    gui: &egui::Context,
    id: &str,
    backdrop: Option<egui::Color32>,
    add: impl FnOnce(&mut egui::Ui) -> R,
) -> egui::InnerResponse<R> {
    let area = egui::Area::new(egui::Id::new(("screen", id)))
        .order(Band::System.order())
        .anchor(egui::Align2::CENTER_CENTER, egui::Vec2::ZERO);
    let shown = gui::show_anchored(gui, area, |ui| {
        ui.vertical_centered(|ui| {
            ui.spacing_mut().item_spacing.y = 16.0;
            add(ui)
        })
        .inner
    });
    let content = shown.response.layer_id;
    match backdrop {
        Some(fill) => {
            let behind = egui::Area::new(egui::Id::new(("backdrop", id)))
                .order(Band::System.order())
                .fixed_pos(egui::Pos2::ZERO)
                .show(gui, |ui| {
                    let screen = ui.ctx().content_rect();
                    ui.painter().rect_filled(screen, 0.0, fill);
                    ui.allocate_rect(screen, egui::Sense::click());
                });
            gui.move_to_top(behind.response.layer_id);
            gui.set_sublayer(behind.response.layer_id, content);
        }
        None => gui.move_to_top(content),
    }
    shown
}

fn notice_panel(ui: &mut Ui, notice: Notice) -> bool {
    egui::Frame::popup(ui.style())
        .inner_margin(egui::Margin::symmetric(24, 18))
        .show(ui, |ui| {
            ui.set_width(NOTICE_WIDTH);
            ui.set_min_height(notice_height(ui));
            ui.vertical_centered(|ui| {
                ui.spacing_mut().item_spacing.y = LINE_GAP;
                ui.heading(notice.title);
                for line in notice.lines {
                    ui.label(line);
                }
                for note in notice.notes {
                    ui.label(
                        RichText::new(note)
                            .size(TextRole::Small.size())
                            .color(color::MUTED),
                    );
                }
                notice
                    .action
                    .is_some_and(|action| ui.button(action).clicked())
            })
            .inner
        })
        .inner
}

fn notice_height(ui: &Ui) -> f32 {
    let line = ui.text_style_height(&TextStyle::Body) + LINE_GAP;
    ui.text_style_height(&TextStyle::Heading) + NOTICE_LINES as f32 * line
}
