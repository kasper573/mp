use egui::{Sense, Ui, Vec2};
use game::systems::area;
use serde_json::Value;

use super::pins;
use crate::app::Editor;
use crate::project::Edit;
use crate::ui::{theme, widgets};

pub(super) fn clipboard_panel(editor: &Editor, ui: &mut Ui) {
    let Some(clip) = &editor.clipboard else {
        return;
    };
    let modules = clip["modules"].as_array().cloned().unwrap_or_default();
    ui.label(
        theme::muted(format!(
            "clipboard · {} module{}",
            modules.len(),
            crate::ui::widgets::plural(modules.len())
        ))
        .monospace()
        .size(13.0),
    );
    ui.add_space(4.0);
    let text = serde_json::to_string_pretty(&Value::Array(modules)).unwrap_or_default();
    let shown: String = text.lines().take(40).collect::<Vec<_>>().join("\n");
    widgets::code_block(ui, &shown);
    if text.lines().count() > 40 {
        ui.label(theme::faint("…").size(12.5));
    }
    ui.add_space(6.0);
}

pub fn pick_preview(editor: &mut Editor, ui: &mut Ui) {
    let Some(pick) = editor.pick.clone() else {
        return;
    };
    let Some(project) = editor.project.as_ref() else {
        return;
    };
    let Some(content) = project.content else {
        return;
    };
    let generation = project.generation;
    let mut area_key = pick.area.clone().or_else(|| {
        let crate::app::PickWhat::Place { file, pointer } = &pick.what;
        project.files.json(file)?.pointer(pointer)?["area"]
            .as_str()
            .map(str::to_owned)
    });
    let mut areas: Vec<String> = content
        .ids::<area::AreaDef>()
        .map(|id| id.key(&content).to_owned())
        .collect();
    areas.sort();
    widgets::section(ui, "Pick a place");
    egui::ComboBox::from_id_salt("pick-area")
        .width(ui.available_width())
        .selected_text(theme::mono(
            area_key
                .clone()
                .unwrap_or_else(|| "choose an area".to_owned()),
        ))
        .show_ui(ui, |ui| {
            for key in &areas {
                if ui
                    .selectable_label(area_key.as_deref() == Some(key.as_str()), key)
                    .clicked()
                {
                    area_key = Some(key.clone());
                }
            }
        });
    if area_key != pick.area
        && let Some(pick) = editor.pick.as_mut()
    {
        pick.area = area_key.clone();
    }
    let Some(area_key) = area_key else {
        return;
    };
    let Some(area_id) = content.by_key::<area::AreaDef>(&area_key) else {
        return;
    };
    let area = area::load(&content, area_id);
    let width = ui.available_width();
    let height = (width * area.size.height / area.size.width.max(1.0)).clamp(80.0, 360.0);
    let (rect, response) = ui.allocate_exact_size(Vec2::new(width, height), Sense::click());
    let ppp = ui.ctx().pixels_per_point();
    let zoom = (rect.width() / (area.size.width * super::TILE_PX))
        .min(rect.height() / (area.size.height * super::TILE_PX));
    let center =
        game::core::math::Pos::new(area.size.width / 2.0 - 0.5, area.size.height / 2.0 - 0.5);
    let view_key = format!("pick:{area_key}");
    editor.views.area.requests.push(super::scene::SceneRequest {
        key: view_key.clone(),
        spec: super::scene::SceneSpec {
            ground: area_key.clone(),
            scenery: super::scene::SceneryOf::Area,
            hidden_ground: Vec::new(),
            show_blueprints: true,
            show_scenery: true,
        },
        width: (rect.width() * ppp).round().max(1.0) as u32,
        height: (rect.height() * ppp).round().max(1.0) as u32,
        center,
        zoom: zoom * ppp,
        generation,
        live: true,
    });
    let painter = ui.painter_at(rect);
    painter.rect_filled(rect, 4.0, theme::INPUT);
    if let Some(scene) = editor.views.area.scenes.by_key.get(&view_key) {
        let uv = egui::Rect::from_min_max(
            egui::Pos2::ZERO,
            egui::pos2(
                scene.shown[0] as f32 / scene.alloc[0] as f32,
                scene.shown[1] as f32 / scene.alloc[1] as f32,
            ),
        );
        painter.image(scene.texture, rect, uv, egui::Color32::WHITE);
    }
    let canvas = super::Canvas { rect, center, zoom };
    for arrival in pins::arrivals(editor, &area_key) {
        let at = canvas.to_screen(arrival.at);
        painter.circle_filled(at, 3.0, egui::Color32::from_rgb(255, 190, 90));
        painter.circle_stroke(at, 3.0, egui::Stroke::new(1.0, egui::Color32::BLACK));
    }
    painter.rect_stroke(
        rect,
        4.0,
        egui::Stroke::new(1.0, theme::BORDER),
        egui::StrokeKind::Inside,
    );
    let alt = ui.input(|i| i.modifiers.alt);
    if let Some(pointer) = response.hover_pos() {
        let tile = canvas.to_tile(pointer);
        let at = if alt {
            game::core::math::Pos::new(
                (tile.x * 16.0).round() / 16.0,
                (tile.y * 16.0).round() / 16.0,
            )
        } else {
            game::core::tiling::TilePos::snap(tile)
        };
        let place = game::systems::script::Place { area: area_id, at };
        let verdict = area::check_place(&content, place);
        let (ok, why) = match &verdict {
            Ok(()) => (true, "outside every warp object".to_owned()),
            Err(problem) => (false, problem.expected.clone()),
        };
        painter.circle_stroke(
            canvas.to_screen(at),
            5.0,
            egui::Stroke::new(
                2.0,
                if ok {
                    egui::Color32::from_rgb(255, 230, 120)
                } else {
                    theme::DANGER
                },
            ),
        );
        response.clone().on_hover_ui(|ui| {
            ui.label(theme::strong(format!(
                "{}, {} · {}",
                crate::forms::tiles(at.x),
                crate::forms::tiles(at.y),
                if ok { "walkable" } else { "refused" }
            )));
            ui.label(theme::muted(format!("{why} · click to pick")).size(12.0));
        });
        if response.clicked() {
            if let Err(problem) = verdict {
                editor.toast(format!("{}: {}", problem.rule, problem.expected));
                return;
            }
            let crate::app::PickWhat::Place { file, pointer } = &pick.what;
            let Some(mut target) = editor
                .project
                .as_ref()
                .and_then(|p| p.files.json_owned(file))
            else {
                editor.pick = None;
                return;
            };
            let Some(slot) = target.pointer_mut(pointer) else {
                editor.pick = None;
                return;
            };
            *slot = serde_json::json!({ "area": area_key, "x": at.x, "y": at.y });
            let mut edit = Edit::new(format!(
                "Pick place {area_key} {}, {} for {file}",
                at.x, at.y
            ));
            edit.write_json(file.clone(), &target);
            if editor.apply(edit) {
                editor.pick = None;
            }
        }
    }
    widgets::hint(
        ui,
        "Click a cell for its centre, Alt-click for any point, in 1/16 tiles. Esc keeps the old place.",
    );
}
