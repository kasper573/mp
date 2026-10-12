use game::core::math::Pos;
use game::core::tiling::Tiles;
use serde_json::Value;

use super::placement::replace_with;
use super::{Frame, shapes};
use crate::app::{Dialog, Editor, PickRowDialog, PickRowThen};
use crate::project::{Edit, Selection, row_file};
use crate::value::RowValue;

pub fn pick_then_add(
    editor: &mut Editor,
    _view_key: &str,
    frame: &Frame,
    module: Value,
    table: &str,
    field: &str,
) {
    editor.dialogs.push(Dialog::PickRow(PickRowDialog {
        title: format!(
            "Pick a {table} for the new {}",
            crate::schema::title(module.kind_or("module"))
        ),
        table: table.to_owned(),
        search: String::new(),
        picked: None,
        options: Vec::new(),
        then: PickRowThen::AddModule {
            area: frame.area_key.clone(),
            module,
            field: field.to_owned(),
        },
    }));
}

pub fn picked_row(editor: &mut Editor, then: PickRowThen, picked: &str) {
    match then {
        PickRowThen::AddModule {
            area,
            mut module,
            field,
        } => {
            module[field] = Value::String(picked.to_owned());
            let Some(mut row) = editor.row_value("area", &area) else {
                return;
            };
            let label = shapes::label(&module);
            let start = row["modules"].as_array().map_or(0, Vec::len);
            if let Some(m) = row["modules"].as_array_mut() {
                m.push(module);
            }
            let mut edit = Edit::new(format!("Add {label} to {area}"));
            edit.write_json(row_file("area", &area), &row);
            if editor.apply(edit) {
                editor.selection = Selection {
                    table: "area".to_owned(),
                    keys: vec![area],
                    parts: vec![format!("/modules/{start}")],
                };
            }
        }
        PickRowThen::ReplaceBlueprint { area, index, scope } => {
            replace_with(editor, &area, index, picked, scope)
        }
        PickRowThen::ReturnDoorTarget { .. } => {}
    }
}

pub fn listen(editor: &mut Editor, frame: &Frame, tile: Pos<Tiles>) {
    crate::views::sound::listen(editor, frame.content, frame.area_id, tile);
    editor.panels.bottom = crate::app::BottomTab::Listen;
}
