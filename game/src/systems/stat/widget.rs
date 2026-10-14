use bevy::prelude::*;
use egui::Ui;

use crate::systems::hud::{HudAudience, Window};
use crate::systems::input::map::InputAction;
use crate::systems::interface::InterfaceIcon;
use crate::systems::job;
use crate::systems::player::session;
use crate::systems::stat;

pub struct StatsWindow;

impl Window for StatsWindow {
    fn audience(&self) -> HudAudience {
        HudAudience::Players
    }
    fn title(&self) -> &'static str {
        "Stats"
    }
    fn toggle(&self) -> InputAction {
        InputAction::ToggleStats
    }
    fn icon(&self) -> InterfaceIcon {
        InterfaceIcon::Stats
    }
    fn show(&self, ui: &mut Ui, world: &mut World) {
        let lines = stats_lines(world);
        egui::ScrollArea::vertical()
            .auto_shrink(false)
            .show(ui, |ui| {
                for line in lines {
                    ui.label(line);
                }
            });
    }
}

fn stats_lines(world: &World) -> Vec<String> {
    let Some(me) = session::my_character(world) else {
        return Vec::new();
    };
    let entity = me.id();
    let stats = stat::effective_all(world, entity);
    std::iter::once(format!("Level {}", job::level(world, entity)))
        .chain(
            stats
                .0
                .iter()
                .map(|stat| format!("{}: {:.1}", stat.label(), stat.value)),
        )
        .collect()
}
