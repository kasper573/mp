use egui::{Ui, Vec2};
use game::core::content::Content;
use game::systems::area;
use serde_json::Value;

use crate::app::Editor;
use crate::forms::FormCx;
use crate::project::row_file;
use crate::ui::{theme, widgets};

pub(super) fn from_npc(ui: &mut Ui, cx: &mut FormCx, module: &Value) {
    let Some(npc) = module["npc"].as_str().map(str::to_owned) else {
        return;
    };
    let Some(row) = cx.files.json(&row_file("npc", &npc)) else {
        return;
    };
    widgets::section(ui, &format!("From npc/{npc}"));
    let modules = row["modules"].as_array().cloned().unwrap_or_default();
    let respawn = modules
        .iter()
        .find(|m| m["type"] == "respawn")
        .and_then(|m| m["after"].as_f64());
    widgets::kv_text(
        ui,
        "respawn",
        respawn.map_or("never".to_owned(), |after| {
            format!("{} s", crate::forms::trim_number(after))
        }),
    );
    let scripts: Vec<String> = modules
        .iter()
        .filter(|m| m["type"].as_str().is_some_and(|t| t.ends_with("_script")))
        .map(|m| match m["script"].as_str() {
            Some(script) => {
                let values: Vec<String> = m["values"]
                    .as_object()
                    .into_iter()
                    .flat_map(|v| v.iter())
                    .map(|(k, v)| {
                        format!(
                            "{k} {}",
                            v.as_f64()
                                .map(crate::forms::trim_number)
                                .unwrap_or_else(|| v
                                    .as_str()
                                    .map(str::to_owned)
                                    .unwrap_or_else(|| v.to_string()))
                        )
                    })
                    .collect();
                if values.is_empty() {
                    script.to_owned()
                } else {
                    format!("{script} · {}", values.join(" · "))
                }
            }
            None => "inline script".to_owned(),
        })
        .collect();
    widgets::kv_text(
        ui,
        "script",
        if scripts.is_empty() {
            "none".to_owned()
        } else {
            scripts.join(", ")
        },
    );
    if let Some(health) = row["stats"]["health"]
        .as_f64()
        .or(row["stats"]["Health"].as_f64())
    {
        widgets::kv_text(ui, "health", crate::forms::trim_number(health));
    }
    ui.add_space(4.0);
    if widgets::chip_coloured(ui, &format!("npc/ {npc} →"), theme::INPUT, theme::CODE).clicked() {
        cx.actions.push(crate::forms::FormAction::OpenRow {
            table: "npc".to_owned(),
            key: npc.clone(),
        });
    }
}

pub fn population_places(
    area: &area::Area,
    module: &Value,
    seed: u64,
) -> Vec<game::core::math::Pos<game::core::tiling::Tiles>> {
    let count = module["count"].as_u64().unwrap_or(0) as usize;
    let nodes: Vec<game::core::math::Pos<game::core::tiling::Tiles>> =
        match super::shapes::rect_of(&module["roams"]) {
            Some(bounds) => area
                .wild_grid
                .nodes()
                .iter()
                .copied()
                .filter(|p| bounds.contains(*p))
                .collect(),
            None => area.wild_grid.nodes().to_vec(),
        };
    if nodes.is_empty() {
        return Vec::new();
    }
    let mut rng = game::core::math::Rng::new(
        seed.wrapping_mul(0x9E37_79B9_7F4A_7C15)
            .wrapping_add(module["count"].as_u64().unwrap_or(0)),
    );
    (0..count)
        .map(|_| nodes[rng.rand_range(0..nodes.len() as u32) as usize])
        .collect()
}

pub fn npc_sprite(
    editor: &mut Editor,
    ctx: &egui::Context,
    content: Content,
    npc: &str,
) -> Option<(egui::TextureId, egui::Rect, Vec2)> {
    let def = content
        .by_key::<game::systems::npc::NpcDef>(npc)?
        .get(&content);
    model_sprite(editor, ctx, content, def.model)
}

pub fn player_sprite(
    editor: &mut Editor,
    ctx: &egui::Context,
    content: Content,
) -> Option<(egui::TextureId, egui::Rect, Vec2)> {
    let player = content
        .table::<game::systems::player::PlayerDef>()
        .keys()
        .first()
        .cloned()?;
    let def = content
        .by_key::<game::systems::player::PlayerDef>(&player)?
        .get(&content);
    model_sprite(editor, ctx, content, def.model)
}

pub fn model_sprite(
    editor: &mut Editor,
    ctx: &egui::Context,
    content: Content,
    model: game::systems::actor::bust::Id,
) -> Option<(egui::TextureId, egui::Rect, Vec2)> {
    let model = game::systems::actor::model(&content, model);
    let project = editor.project.as_ref()?;
    let thumb = editor
        .form
        .thumbnails
        .image(ctx, &project.files, model.sheet().as_str())?;
    let region = model.frame(
        game::systems::actor::Action::Idle,
        game::core::math::Direction::S,
        game::core::time::Seconds(0.0),
        game::core::time::PlaybackRate(1.0),
    );
    let drawn = model.drawn_size(region);
    let uv = crate::thumbs::uv(
        thumb.size,
        region.min().x,
        region.min().y,
        region.size.width,
        region.size.height,
    );
    Some((thumb.texture.id(), uv, Vec2::new(drawn.width, drawn.height)))
}
