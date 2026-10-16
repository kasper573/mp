use std::collections::VecDeque;

use bevy::prelude::*;
use bevy_egui::EguiPrimaryContextPass;
use design_tokens::family;
use egui::{Align2, Color32, FontId, Mesh, RichText, Sense, UiBuilder, Vec2};

use crate::core::gui::{self, Band};
use crate::core::time::{Hertz, Seconds};
use crate::systems::settings::UserSettings;

pub struct FrameRatePlugin;

impl Plugin for FrameRatePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<FrameRates>()
            .add_systems(Update, count_frames)
            .add_systems(EguiPrimaryContextPass, draw_meter.in_set(Band::System));
    }
}

/// How far back the meter looks.
const HISTORY: Seconds = Seconds(10.0);

/// Frames are counted in runs of at least this long, each one bar of the graph.
const RUN: Seconds = Seconds(0.25);

const MARGIN: f32 = 8.0;
const SIZE: Vec2 = Vec2::new(160.0, 96.0);
const TEXT_AT: Vec2 = Vec2::new(6.0, 4.0);
const TEXT_SIZE: f32 = 18.0;
const GRAPH_AT: Vec2 = Vec2::new(6.0, 30.0);
const GRAPH_SIZE: Vec2 = Vec2::new(148.0, 60.0);
const PANEL: Color32 = Color32::from_rgb(26, 26, 56);
const GRAPH: Color32 = Color32::from_rgb(26, 49, 76);
const INK: Color32 = Color32::from_rgb(26, 255, 255);

/// The frame rate of each run of frames over the last [`HISTORY`], oldest first.
#[derive(Resource, Default)]
struct FrameRates {
    runs: VecDeque<Hertz>,
    frames: u32,
    spent: Seconds,
}

impl FrameRates {
    fn latest(&self) -> Option<Hertz> {
        self.runs.back().copied()
    }

    fn range(&self) -> (Hertz, Hertz) {
        self.runs
            .iter()
            .fold((Hertz(f32::INFINITY), Hertz(0.0)), |(low, high), &rate| {
                (Hertz(low.0.min(rate.0)), Hertz(high.0.max(rate.0)))
            })
    }
}

/// A run's rate is its frames over the time they took, so however frames fall into runs, a steady
/// rate reads steady.
fn count_frames(time: Res<Time<Real>>, mut rates: ResMut<FrameRates>) {
    rates.frames += 1;
    rates.spent.0 += time.delta_secs();
    if rates.spent < RUN {
        return;
    }
    let rate = Hertz(rates.frames as f32 / rates.spent.0);
    rates.runs.push_back(rate);
    while rates.runs.len() > runs_kept() {
        rates.runs.pop_front();
    }
    rates.frames = 0;
    rates.spent = Seconds(0.0);
}

fn draw_meter(world: &mut World) {
    if !world.resource::<UserSettings>().frame_rate_shown() {
        return;
    }
    let Some(gui) = gui::context(world) else {
        return;
    };
    let rates = world.resource::<FrameRates>();
    let Some(latest) = rates.latest() else {
        return;
    };
    let (low, high) = rates.range();
    let readout = format!("{:.0} FPS ({:.0}-{:.0})", latest.0, low.0, high.0);
    let area = egui::Area::new(egui::Id::new("frame rate meter"))
        .order(Band::System.order())
        .anchor(Align2::LEFT_BOTTOM, Vec2::new(MARGIN, -MARGIN))
        .interactable(false);
    gui::show_anchored(&gui, area, |ui| {
        let (panel, _) = ui.allocate_exact_size(SIZE, Sense::hover());
        ui.painter().rect_filled(panel, 0.0, PANEL);
        ui.scope_builder(
            UiBuilder::new().max_rect(egui::Rect::from_min_size(panel.min + TEXT_AT, SIZE)),
            |ui| {
                ui.add(
                    egui::Label::new(
                        RichText::new(readout)
                            .font(FontId::new(TEXT_SIZE, family::bold()))
                            .color(INK),
                    )
                    .extend()
                    .selectable(false),
                );
            },
        );
        let graph = egui::Rect::from_min_size(panel.min + GRAPH_AT, GRAPH_SIZE);
        ui.painter().rect_filled(graph, 0.0, GRAPH);
        ui.painter().add(bars(graph, &rates.runs, high));
    });
}

/// One bar per run, newest at the right, as tall as its rate against the highest on the graph. Laid
/// down as one mesh, so neighbouring bars meet without a seam.
fn bars(graph: egui::Rect, runs: &VecDeque<Hertz>, high: Hertz) -> Mesh {
    let width = graph.width() / runs_kept() as f32;
    let mut mesh = Mesh::default();
    for (age, rate) in runs.iter().rev().enumerate() {
        let right = graph.right() - width * age as f32;
        let height = graph.height() * (rate.0 / high.0).clamp(0.0, 1.0);
        mesh.add_colored_rect(
            egui::Rect::from_min_max(
                egui::pos2(right - width, graph.bottom() - height),
                egui::pos2(right, graph.bottom()),
            ),
            INK,
        );
    }
    mesh
}

fn runs_kept() -> usize {
    (HISTORY.0 / RUN.0).round() as usize
}
