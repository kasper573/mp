use egui::{Color32, Pos2, Rect as ERect, RichText, Sense, Ui, Vec2};
use game::core::content::Content;
use game::systems::area;
use serde_json::Value;

use super::grid;
use crate::app::{ConfirmAction, ConfirmDialog, Dialog, Editor};
use crate::project::{Edit, row_file};
use crate::ui::{theme, widgets};

const WIDTH: f32 = 190.0;

pub fn popover(
    editor: &mut Editor,
    ui: &mut Ui,
    view_key: &str,
    content: Content,
    area_id: area::Id,
    canvas: ERect,
) {
    let area_key = area_id.key(&content).to_owned();
    let Some(row) = editor.row_value("area", &area_key) else {
        return;
    };
    let layers: Vec<String> = row["map"]["ground"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|v| v.as_str().map(str::to_owned))
        .collect();
    let (blueprints, scenery) = {
        let placed = area::placed(&content, area_id);
        let blueprints = area::placements(&content, area_id)
            .iter()
            .filter(|p| p.chain.len() <= 1)
            .count();
        let scenery = placed
            .iter()
            .filter(|p| p.chain.is_empty() && matches!(p.module, area::AreaModule::Scenery(_)))
            .count();
        (blueprints, scenery)
    };
    let mut action: Option<LayerAction> = None;
    let rect = ERect::from_min_size(
        Pos2::new(canvas.max.x - WIDTH - 16.0, canvas.min.y + 12.0),
        Vec2::new(WIDTH, 0.0),
    );
    let mut panel = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(ERect::from_min_size(
                rect.min,
                Vec2::new(WIDTH, canvas.height() - 24.0),
            ))
            .layout(egui::Layout::top_down(egui::Align::Min)),
    );
    egui::Frame::new()
        .fill(Color32::from_rgba_unmultiplied(24, 26, 30, 235))
        .stroke(egui::Stroke::new(1.0, theme::BORDER))
        .corner_radius(6.0)
        .inner_margin(egui::Margin::symmetric(10, 8))
        .show(&mut panel, |ui| {
            ui.set_width(WIDTH - 20.0);
            ui.spacing_mut().item_spacing.y = 2.0;
            ui.label(
                RichText::new("LAYERS")
                    .size(11.0)
                    .color(theme::MUTED)
                    .family(egui::FontFamily::Name("medium".into())),
            );
            widgets::section(ui, "Ground · under everyone");
            let active = editor.views.area.views[view_key]
                .layer
                .min(layers.len().saturating_sub(1));
            let view = editor.views.area.views.get_mut(view_key).expect("view");
            for (index, name) in layers.iter().enumerate() {
                let hidden = view.hidden_ground.contains(name);
                let response = eye_row(ui, name, !hidden, index == active, None);
                if response.eye.clicked() {
                    if hidden {
                        view.hidden_ground.remove(name);
                    } else {
                        view.hidden_ground.insert(name.clone());
                    }
                }
                if response.row.clicked() {
                    action = Some(LayerAction::Pick(index));
                }
                response.row.context_menu(|ui| {
                    if ui.button("Rename…").clicked() {
                        action = Some(LayerAction::Rename(index));
                        ui.close();
                    }
                    if index + 1 < layers.len() && ui.button("Move up").clicked() {
                        action = Some(LayerAction::Swap(index, index + 1));
                        ui.close();
                    }
                    if index > 0 && ui.button("Move down").clicked() {
                        action = Some(LayerAction::Swap(index, index - 1));
                        ui.close();
                    }
                    if layers.len() > 1 && ui.button("Delete…").clicked() {
                        action = Some(LayerAction::Delete(index));
                        ui.close();
                    }
                });
            }
            if ui
                .add(egui::Label::new(theme::faint("+ layer").size(12.5)).sense(Sense::click()))
                .clicked()
            {
                action = Some(LayerAction::Add);
            }
            widgets::section(ui, "Placed on the ground");
            let response = eye_row(
                ui,
                "blueprints",
                view.show_blueprints,
                false,
                Some(blueprints),
            );
            if response.eye.clicked() || response.row.clicked() {
                view.show_blueprints = !view.show_blueprints;
            }
            let response = eye_row(ui, "scenery", view.show_scenery, false, Some(scenery));
            if response.eye.clicked() || response.row.clicked() {
                view.show_scenery = !view.show_scenery;
            }
            widgets::section(ui, "Overlays");
            for (name, flag) in [
                ("modules", &mut view.overlay_modules),
                ("walk", &mut view.walk_overlay),
                ("surfaces", &mut view.overlay_surfaces),
                ("sort lines", &mut view.overlay_sort_lines),
            ] {
                let response = eye_row(ui, name, *flag, false, None);
                if response.eye.clicked() || response.row.clicked() {
                    *flag = !*flag;
                }
            }
        });
    let Some(action) = action else {
        return;
    };
    match action {
        LayerAction::Pick(index) => {
            editor
                .views
                .area
                .views
                .get_mut(view_key)
                .expect("view")
                .layer = index;
        }
        LayerAction::Add => {
            let name = unique_layer(&layers, "layer");
            let mut row = row.clone();
            row["map"]["ground"]
                .as_array_mut()
                .expect("layers")
                .push(Value::String(name.clone()));
            let grids = area::load(&content, area_id).grids;
            let mut draft = grid::GridDraft::of(&area_key, grids);
            draft.add_layer(&name);
            let mut edit = Edit::new(format!("Add layer {name} to {area_key}"));
            edit.write_json(row_file("area", &area_key), &row);
            draft.write_into(&mut edit);
            if editor.apply(edit) {
                editor
                    .views
                    .area
                    .views
                    .get_mut(view_key)
                    .expect("view")
                    .layer = layers.len();
            }
        }
        LayerAction::Rename(index) => {
            let name = layers[index].clone();
            let draft_key = format!("rename-layer:{area_key}:{name}");
            editor
                .form
                .drafts
                .insert(egui::Id::new(&draft_key), name.clone());
            editor
                .dialogs
                .push(Dialog::Rename(crate::app::RenameDialog {
                    table: format!("area/{area_key} layer"),
                    key: name.clone(),
                    draft: name,
                    error: None,
                }));
        }
        LayerAction::Swap(a, b) => {
            let mut row = row.clone();
            row["map"]["ground"]
                .as_array_mut()
                .expect("layers")
                .swap(a, b);
            let mut edit = Edit::new(format!("Reorder layers of {area_key}"));
            edit.write_json(row_file("area", &area_key), &row);
            if editor.apply(edit) {
                editor
                    .views
                    .area
                    .views
                    .get_mut(view_key)
                    .expect("view")
                    .layer = b;
            }
        }
        LayerAction::Delete(index) => {
            let name = layers[index].clone();
            editor.dialogs.push(Dialog::Confirm(ConfirmDialog {
                title: format!("Delete layer {name}?"),
                body: format!("Every tile of {name} in {area_key} goes with it. One undo step."),
                label: "Delete layer".to_owned(),
                compare: None,
                action: ConfirmAction::RemoveLayer {
                    area: area_key.clone(),
                    layer: name,
                },
            }));
        }
    }
}

struct EyeRow {
    eye: egui::Response,
    row: egui::Response,
}

fn eye_row(ui: &mut Ui, name: &str, shown: bool, active: bool, count: Option<usize>) -> EyeRow {
    let full = ui.available_width();
    let (rect, row) = ui.allocate_exact_size(Vec2::new(full, 20.0), Sense::click());
    if active {
        ui.painter().rect_filled(rect, 3.0, theme::ACCENT);
    } else if row.hovered() {
        ui.painter().rect_filled(rect, 3.0, theme::RAISED);
    }
    let eye_rect = ERect::from_min_size(rect.min + Vec2::new(4.0, 2.0), Vec2::splat(16.0));
    let eye = ui.interact(eye_rect, row.id.with("eye"), Sense::click());
    let ink = if active {
        Color32::WHITE
    } else if shown {
        theme::TEXT
    } else {
        theme::FAINT
    };
    draw_eye(ui.painter(), eye_rect.center(), shown, ink);
    ui.painter().text(
        rect.min + Vec2::new(26.0, 10.0),
        egui::Align2::LEFT_CENTER,
        name,
        egui::FontId::monospace(13.0),
        ink,
    );
    if let Some(count) = count {
        ui.painter().text(
            rect.right_center() - Vec2::new(6.0, 0.0),
            egui::Align2::RIGHT_CENTER,
            count.to_string(),
            egui::FontId::monospace(12.0),
            if active { Color32::WHITE } else { theme::MUTED },
        );
    }
    EyeRow { eye, row }
}

fn draw_eye(painter: &egui::Painter, c: Pos2, open: bool, ink: Color32) {
    let stroke = egui::Stroke::new(1.3, ink);
    let points: Vec<Pos2> = (0..=12)
        .map(|i| {
            let t = i as f32 / 12.0 * std::f32::consts::PI;
            Pos2::new(c.x - 6.0 + 12.0 * i as f32 / 12.0, c.y - 3.5 * t.sin())
        })
        .collect();
    painter.add(egui::Shape::line(points.clone(), stroke));
    let lower: Vec<Pos2> = points
        .iter()
        .map(|p| Pos2::new(p.x, 2.0 * c.y - p.y))
        .collect();
    painter.add(egui::Shape::line(lower, stroke));
    if open {
        painter.circle_filled(c, 2.0, ink);
    } else {
        painter.line_segment([c + Vec2::new(-6.0, 5.0), c + Vec2::new(6.0, -5.0)], stroke);
    }
}

enum LayerAction {
    Pick(usize),
    Add,
    Rename(usize),
    Swap(usize, usize),
    Delete(usize),
}

fn unique_layer(layers: &[String], base: &str) -> String {
    if !layers.iter().any(|l| l.eq_ignore_ascii_case(base)) {
        return base.to_owned();
    }
    (2..)
        .map(|n| format!("{base}_{n}"))
        .find(|candidate| !layers.iter().any(|l| l.eq_ignore_ascii_case(candidate)))
        .expect("a free layer name")
}
