use engine::core::math::Pos;
use engine::core::tiling::Tiles;
use serde_json::Value;

use super::placement::replace_with;
use super::{AreaFrame, nodes, shapes};
use crate::app::{BottomTab, Editor, ModalDialog, PickRowDialog, PickRowThen};
use crate::schema;
use crate::value::RowValue;
use crate::views::sound;

pub fn pick_then_add(
    editor: &mut Editor,
    frame: &AreaFrame,
    module: Value,
    table: &str,
    field: &str,
) {
    editor.dialogs.push(ModalDialog::PickRow(PickRowDialog {
        title: format!(
            "Pick a {table} for the new {}",
            schema::title(module.kind_or("module"))
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
            let label = format!("Add {} to {area}", shapes::label(&module));
            nodes::add(editor, &area, vec![module], &label);
        }
        PickRowThen::ReplaceBlueprint { area, node } => replace_with(editor, &area, &node, picked),
    }
}

pub fn listen(editor: &mut Editor, frame: &AreaFrame, tile: Pos<Tiles>) {
    sound::listen(editor, &frame.content, frame.area_id, tile);
    editor.panels.bottom = BottomTab::Listen;
}
