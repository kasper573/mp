use egui::Ui;

use super::theme;
use crate::app::Editor;
use crate::forms::{self, FormAction, FormCx};
use crate::project::files::GAME_FILE;
use crate::project::{Edit, Selection};
use crate::tabs::Tab;

pub fn show_game(editor: &mut Editor, ui: &mut Ui) {
    let Some(mut value) = editor
        .project
        .as_ref()
        .and_then(|project| project.files.json_owned(GAME_FILE))
    else {
        return;
    };
    ui.label(theme::muted(GAME_FILE).monospace().size(13.0));
    ui.add_space(4.0);
    let shapes = editor.shapes.clone();
    let mut actions = Vec::new();
    let changed = {
        let Editor {
            project,
            form,
            shapes: known,
            ..
        } = editor;
        let project = project.as_ref().expect("a project");
        let mut cx = FormCx::new(project, &shapes.settings, known, form, &mut actions);
        ui.push_id("game", |ui| {
            forms::object_without(
                ui,
                &mut cx,
                &shapes.settings,
                &mut value,
                "",
                &["content_version"],
            )
        })
        .inner
    };
    if changed.is_some() {
        let mut edit = Edit::new("Edit the game");
        edit.write_json(GAME_FILE, &value);
        editor.apply(edit);
    }
    for action in actions {
        match action {
            FormAction::OpenRow { table, key } => {
                editor.select(Selection::row(&table, &key));
                editor.open_tab(Tab::for_row(&table, &key));
            }
            FormAction::PickPlace { path } => {
                editor.pick = Some(crate::app::PickRequest {
                    what: crate::app::PickWhat::Place {
                        file: GAME_FILE.to_owned(),
                        pointer: path,
                    },
                    area: None,
                });
                editor.toast("Click a walkable cell on an area to put the initial spawn there");
            }
            FormAction::OpenScript { .. }
            | FormAction::NewRow { .. }
            | FormAction::RowAction(_) => {}
        }
    }
}
