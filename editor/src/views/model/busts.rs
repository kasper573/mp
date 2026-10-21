use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use design_tokens::glyph::Mark;
use egui::{Color32, Rect as ERect, Sense, Ui, Vec2};
use engine::core::content::{ContentFile, bundle_of};
use engine::core::script::Node;
use engine::systems::actor::ModelDef;
use engine::systems::actor::model::{Expression, GenericExpression, MODEL_BUSTS, ModelModule};
use engine::systems::npc::NpcDef;
use engine::systems::script::{ScriptDef, Speaker};
use strum::VariantArray;

use crate::app::Editor;
use crate::project::{ContentEdit, Project, RowSelection};
use crate::rows;
use crate::tabs::shown_path;
use crate::thumbs;
use crate::ui::{theme, widgets};

const CARD: Vec2 = Vec2::new(178.0, 165.0);

/// A face of a model's bust, drawn in a part of its bundle.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BustFace {
    pub name: String,
    pub file: String,
    /// Whether the face is the model's own rather than one every bust has.
    pub own: bool,
}

impl BustFace {
    /// What a selection holds while the face is picked: its part of the bundle.
    pub fn part(&self) -> String {
        bundle_of(&self.file).map_or_else(|| self.file.clone(), |(_, part)| part.to_owned())
    }
}

pub fn module_index(model: &ModelDef) -> Option<usize> {
    model
        .modules
        .iter()
        .position(|module| matches!(module, ModelModule::Bust(_)))
}

/// Every face of the model's bust: the generic ones, then its own.
pub fn faces(model: &ModelDef) -> Vec<BustFace> {
    let Some(busts) = model.busts() else {
        return Vec::new();
    };
    let generic = GenericExpression::VARIANTS
        .iter()
        .map(|&expression| BustFace {
            name: expression.as_ref().to_owned(),
            file: busts.generic.of(expression).as_str().to_owned(),
            own: false,
        });
    let own = busts.own.iter().map(|bust| BustFace {
        name: bust.name.clone(),
        file: bust.file.as_str().to_owned(),
        own: true,
    });
    generic.chain(own).collect()
}

/// The name of every face a bust of `model` has: the generic ones, then the model's own.
pub fn face_names(model: Option<&ModelDef>) -> Vec<String> {
    let generic = GenericExpression::VARIANTS
        .iter()
        .map(|expression| expression.as_ref().to_owned());
    let own = model
        .and_then(ModelDef::busts)
        .into_iter()
        .flat_map(|busts| busts.own.iter().map(|bust| bust.name.clone()));
    generic.chain(own).collect()
}

/// The model the npc at `npc` wears, when both read.
pub fn model_of_npc(project: &Project, npc: &str) -> Option<Arc<ModelDef>> {
    let npc = project.read::<NpcDef>(npc).ok()?;
    project.read_id(npc.model)
}

/// The part of the model at `key` a bust of `name` is drawn in.
pub fn face_file(key: &str, name: &str) -> String {
    format!("{key}/{}", MODEL_BUSTS.named(name, "png"))
}

/// What the speakers using the model at `key` are called, its path when nobody speaks with it.
pub fn speaker_name(editor: &Editor, key: &str) -> String {
    super::users(editor, key)
        .iter()
        .find_map(|(_, user)| Some(editor.read::<NpcDef>(user)?.ok()?.name.clone()))
        .unwrap_or_else(|| shown_path(key).to_owned())
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str, row: &ModelDef) {
    let ctx = ui.ctx().clone();
    let faces = faces(row);
    let title = speaker_name(editor, key);
    widgets::section(ui, &format!("Bust · {title}"));
    if module_index(row).is_none() {
        ui.add_space(6.0);
        widgets::hint(ui, "No bust module: this model never speaks.");
        editor
            .status
            .left
            .push(format!("{} · no bust", shown_path(key)));
        return;
    }
    let drops = std::mem::take(&mut editor.views.model.drops);
    let pointer = ui.input(|i| i.pointer.hover_pos());
    let selected = editor.views.model.view(key).face.clone();
    let mut pick = None;
    let mut replace: Option<(BustFace, PathBuf)> = None;
    let mut add: Vec<PathBuf> = Vec::new();
    let mut browse = false;
    let per_row = ((ui.available_width() + 12.0) / (CARD.x + 12.0))
        .floor()
        .max(1.0) as usize;
    ui.add_space(4.0);
    egui::Grid::new(("busts", key))
        .spacing(Vec2::new(12.0, 12.0))
        .show(ui, |ui| {
            for (index, face) in faces.iter().enumerate() {
                let thumb = editor.thumb(&ctx, &face.file);
                let is_selected = selected.as_deref() == Some(&face.name);
                let response = card(ui, face, thumb.as_ref(), is_selected, key);
                if response.clicked() {
                    pick = Some(face.clone());
                }
                if !drops.is_empty()
                    && let Some(at) = pointer
                    && response.rect.contains(at)
                    && let Some(path) = drops.first()
                {
                    replace = Some((face.clone(), path.clone()));
                }
                if (index + 1) % per_row == 0 {
                    ui.end_row();
                }
            }
            let (rect, response) = ui.allocate_exact_size(CARD, Sense::click());
            let painter = ui.painter_at(rect);
            painter.rect_filled(rect, 4.0, theme::SELECTION.gamma_multiply(0.5));
            widgets::dashed_rect(
                &painter,
                rect,
                egui::Stroke::new(1.0, theme::ACCENT),
                4.0,
                4.0,
            );
            Mark::Plus.paint(
                &painter,
                ERect::from_center_size(rect.center() - Vec2::new(0.0, 10.0), Vec2::splat(18.0)),
                theme::ACCENT,
            );
            painter.text(
                rect.center() + Vec2::new(0.0, 12.0),
                egui::Align2::CENTER_CENTER,
                "drop to add an expression",
                egui::FontId::proportional(12.5),
                theme::ACCENT,
            );
            if response.clicked() {
                browse = true;
            }
            response.on_hover_text("Drop a PNG here, or click to browse for one");
            ui.end_row();
        });
    if replace.is_none() && !drops.is_empty() {
        add = drops.clone();
    }
    if browse
        && let Some(path) = rfd::FileDialog::new()
            .add_filter("PNG", &["png"])
            .pick_file()
    {
        add.push(path);
    }
    if let Some(face) = pick {
        let view = editor.views.model.view_mut(key);
        view.face = Some(face.name.clone());
        editor.select(RowSelection::parts(ModelDef::TABLE, key, vec![face.part()]));
    }
    if let Some((face, path)) = replace {
        replace_file(editor, key, &face, &path);
    }
    for path in add {
        add_expression(editor, key, &faces, &path);
    }
    editor.status.left.push(format!(
        "{} · bust · {} expressions",
        shown_path(key),
        faces.len()
    ));
    editor
        .status
        .left
        .push("drop PNG files onto slots to add or replace".to_owned());
}

fn card(
    ui: &mut Ui,
    face: &BustFace,
    thumb: Option<&thumbs::Thumbnail>,
    selected: bool,
    key: &str,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(CARD, Sense::click());
    let painter = ui.painter_at(rect);
    painter.rect(
        rect,
        4.0,
        theme::INPUT,
        egui::Stroke::new(
            if selected { 2.0 } else { 1.0 },
            if selected {
                theme::ACCENT
            } else {
                theme::BORDER
            },
        ),
        egui::StrokeKind::Inside,
    );
    let art = ERect::from_min_max(
        rect.min + Vec2::new(4.0, 4.0),
        rect.right_bottom() - Vec2::new(4.0, 28.0),
    );
    match thumb {
        Some(thumb) => {
            let (w, h) = (thumb.size[0] as f32, thumb.size[1] as f32);
            let scale = (art.width() / w).min(art.height() / h);
            let shown = Vec2::new(w * scale, h * scale);
            painter.image(
                thumb.texture.id(),
                ERect::from_center_size(art.center(), shown),
                thumbs::FULL_UV,
                Color32::WHITE,
            );
        }
        None => {
            painter.text(
                art.center(),
                egui::Align2::CENTER_CENTER,
                "missing file",
                egui::FontId::proportional(12.0),
                theme::DANGER,
            );
        }
    }
    painter.text(
        egui::pos2(rect.min.x + 8.0, rect.max.y - 14.0),
        egui::Align2::LEFT_CENTER,
        &face.name,
        egui::FontId::proportional(13.0),
        theme::TEXT,
    );
    painter.text(
        egui::pos2(rect.max.x - 8.0, rect.max.y - 14.0),
        egui::Align2::RIGHT_CENTER,
        if face.own {
            format!("{} only", shown_path(key))
        } else {
            "generic".to_owned()
        },
        egui::FontId::proportional(11.0),
        theme::MUTED,
    );
    response
}

fn png_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let bytes = std::fs::read(path).map_err(|error| format!("{}: {error}", path.display()))?;
    if !bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err(format!("{} is not a PNG", path.display()));
    }
    Ok(bytes)
}

fn replace_file(editor: &mut Editor, key: &str, face: &BustFace, path: &Path) {
    let bytes = match png_bytes(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            editor.toast(error);
            return;
        }
    };
    let mut edit = ContentEdit::new(format!(
        "Replace {} of {}'s bust",
        face.name,
        shown_path(key)
    ));
    edit.write(face.file.to_owned(), bytes.into());
    editor.apply(edit);
}

fn add_expression(editor: &mut Editor, key: &str, faces: &[BustFace], path: &Path) {
    let bytes = match png_bytes(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            editor.toast(error);
            return;
        }
    };
    let stem = path
        .file_stem()
        .map(|stem| {
            stem.to_string_lossy()
                .to_lowercase()
                .replace([' ', '-'], "_")
        })
        .unwrap_or_else(|| "expression".to_owned());
    let taken: HashSet<String> = faces.iter().map(|face| face.name.clone()).collect();
    let name = rows::free_name(&stem, &taken);
    let face = BustFace {
        file: face_file(key, &name),
        name,
        own: true,
    };
    let mut edit = ContentEdit::new(format!(
        "Add expression {} to {}'s bust",
        face.name,
        shown_path(key)
    ));
    edit.write(face.file.clone(), bytes.into());
    if editor.apply(edit) {
        editor.views.model.view_mut(key).face = Some(face.name.clone());
        editor.select(RowSelection::parts(ModelDef::TABLE, key, vec![face.part()]));
    }
}

#[derive(Clone, Debug)]
pub struct FaceLine {
    pub script: String,
    pub node: String,
    pub face: String,
}

/// Every line of every script spoken by an npc wearing the model at `key` that asks for a face.
pub fn lines(editor: &Editor, key: &str) -> Vec<FaceLine> {
    let Some(reader) = editor.reader() else {
        return Vec::new();
    };
    let speakers: Vec<String> = super::users(editor, key)
        .into_iter()
        .filter(|(table, _)| table == NpcDef::TABLE)
        .map(|(_, key)| key)
        .collect();
    let mut found = Vec::new();
    for path in reader.paths_of::<ScriptDef>() {
        let Some(Ok(script)) = editor.read::<ScriptDef>(path) else {
            continue;
        };
        for (node, line) in face_lines(&script) {
            let Speaker::Npc(npc) = line.by else {
                continue;
            };
            if let Some(face) = &line.face
                && reader
                    .path_of(npc)
                    .is_some_and(|npc| speakers.iter().any(|speaker| speaker == npc))
            {
                found.push(FaceLine {
                    script: path.clone(),
                    node: node.clone(),
                    face: String::from(face.clone()),
                });
            }
        }
    }
    found
}

fn face_lines(
    script: &ScriptDef,
) -> impl Iterator<Item = (&String, &engine::systems::script::Line)> {
    script.nodes.iter().flat_map(|(name, node)| {
        let lines = match node {
            Node::Dialogue(dialogue) => dialogue.lines.as_slice(),
            _ => &[],
        };
        lines.iter().map(move |line| (name, line))
    })
}

pub fn rename(editor: &mut Editor, key: &str, face: &BustFace, new_name: &str) -> bool {
    let Some(Ok(model)) = editor.read::<ModelDef>(key) else {
        return false;
    };
    if !face.own {
        return false;
    }
    if faces(&model).iter().any(|face| face.name == new_name) {
        editor.toast(format!("{new_name} is already a face of this model"));
        return false;
    }
    let Some(bytes) = editor
        .project
        .as_ref()
        .and_then(|project| project.files.get(&face.file).cloned())
    else {
        return false;
    };
    let Some(mut edit) = retarget_face(
        editor,
        key,
        &face.name,
        new_name,
        format!(
            "Rename face {} of {} to {new_name}",
            face.name,
            shown_path(key)
        ),
    ) else {
        return false;
    };
    edit.remove(face.file.clone());
    edit.write(face_file(key, new_name), bytes);
    editor.apply(edit)
}

pub fn remove(editor: &mut Editor, key: &str, face: &BustFace, replacement: &str) -> bool {
    if !face.own {
        return false;
    }
    let Some(mut edit) = retarget_face(
        editor,
        key,
        &face.name,
        replacement,
        format!("Remove face {} of {}", face.name, shown_path(key)),
    ) else {
        return false;
    };
    edit.remove(face.file.clone());
    editor.apply(edit)
}

/// An edit giving every line that asks the model at `key` for face `from` face `to` instead.
fn retarget_face(
    editor: &mut Editor,
    key: &str,
    from: &str,
    to: &str,
    label: String,
) -> Option<ContentEdit> {
    let mut scripts: Vec<String> = lines(editor, key)
        .into_iter()
        .filter(|line| line.face == from)
        .map(|line| line.script)
        .collect();
    scripts.sort();
    scripts.dedup();
    let (from, to) = (
        Expression::from(from.to_owned()),
        Expression::from(to.to_owned()),
    );
    let mut edit = ContentEdit::new(label);
    for path in scripts {
        let mut script = (*editor.read::<ScriptDef>(&path)?.ok()?).clone();
        for node in script.nodes.values_mut() {
            if let Node::Dialogue(dialogue) = node {
                for line in &mut dialogue.lines {
                    if line.face.as_ref() == Some(&from) {
                        line.face = Some(to.clone());
                    }
                }
            }
        }
        if let Err(reason) = edit.write_content(editor.project.as_ref()?, &path, &script) {
            editor.toast(reason);
            return None;
        }
    }
    Some(edit)
}
