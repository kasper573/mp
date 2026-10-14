pub mod area;
pub mod connection;
pub mod loading;
pub mod mode;

use bevy::prelude::*;
use renet2::RenetClient;

use crate::core::gui::Band;
use crate::core::time::{Backoff, Seconds};
use crate::systems::player::{JoinRequest, session};
use crate::systems::spectate::SpectateRequest;
use connection::{Announce, PendingSession};

const SERVER_RETRY: Backoff = Backoff {
    first: Seconds(1.0),
    longest: Seconds(30.0),
};

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

/// A screen of the system's own between play: centred above everything but modals, over a
/// backdrop that hides the world when there is one.
pub(crate) fn system_screen<R>(
    gui: &egui::Context,
    id: &str,
    backdrop: Option<egui::Color32>,
    add: impl FnOnce(&mut egui::Ui) -> R,
) -> egui::InnerResponse<R> {
    let shown = egui::Area::new(egui::Id::new(("screen", id)))
        .order(Band::System.order())
        .anchor(egui::Align2::CENTER_CENTER, egui::Vec2::ZERO)
        .show(gui, |ui| {
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
