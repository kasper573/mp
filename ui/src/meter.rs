//! A meter: a readout over a graph of bars, on a slip laid at a corner of the screen.

use egui::{Align2, Context, Id, Mesh, Order, Rect, RichText, Sense, UiBuilder, Vec2};

use crate::face::Face;
use crate::{float, ink, slip};

/// What a meter shows: its `readout`, and `bars` from oldest to newest, each as tall as its
/// fraction of the graph, in a graph `slots` bars wide that fills from its right.
pub struct Meter<'a> {
    pub readout: &'a str,
    pub bars: &'a [f32],
    pub slots: usize,
}

/// Draws `meter` at `corner` of `gui`, `offset` in from it, on the `order` layer.
pub fn show(gui: &Context, id: &str, order: Order, corner: Align2, offset: Vec2, meter: &Meter) {
    let area = egui::Area::new(Id::new(id))
        .order(order)
        .anchor(corner, offset)
        .interactable(false);
    float::anchored(gui, area, |ui| {
        let (panel, _) = ui.allocate_exact_size(SIZE, Sense::hover());
        slip::paint(ui.painter(), panel);
        ui.scope_builder(
            UiBuilder::new().max_rect(Rect::from_min_size(panel.min + TEXT_AT, SIZE)),
            |ui| {
                ui.add(
                    egui::Label::new(
                        RichText::new(meter.readout)
                            .font(Face::MonoBold.id(TEXT_SIZE))
                            .color(ink::INK),
                    )
                    .extend()
                    .selectable(false),
                );
            },
        );
        let graph = Rect::from_min_size(panel.min + GRAPH_AT, GRAPH_SIZE);
        ui.painter().rect_filled(graph, 0.0, ink::ink_wash(0.06));
        ui.painter().add(bars(graph, meter));
    });
}

const SIZE: Vec2 = Vec2::new(160.0, 96.0);
const TEXT_AT: Vec2 = Vec2::new(8.0, 6.0);
const TEXT_SIZE: f32 = 15.0;
const GRAPH_AT: Vec2 = Vec2::new(8.0, 30.0);
const GRAPH_SIZE: Vec2 = Vec2::new(144.0, 58.0);

/// One bar per slot, newest at the right. Laid down as one mesh, so neighbouring bars meet without
/// a seam.
fn bars(graph: Rect, meter: &Meter) -> Mesh {
    let width = graph.width() / meter.slots.max(1) as f32;
    let mut mesh = Mesh::default();
    for (age, fraction) in meter.bars.iter().rev().enumerate() {
        let right = graph.right() - width * age as f32;
        let height = graph.height() * fraction.clamp(0.0, 1.0);
        mesh.add_colored_rect(
            Rect::from_min_max(
                egui::pos2(right - width, graph.bottom() - height),
                egui::pos2(right, graph.bottom()),
            ),
            ink::INK2,
        );
    }
    mesh
}
