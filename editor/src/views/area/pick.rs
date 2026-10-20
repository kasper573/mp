use engine::core::math::Pos;
use engine::core::tiling::Tiles;
use serde_json::Value;

use super::{AreaFrame, nodes, shapes};
use crate::app::{BottomTab, Editor, ModalDialog, PickRowDialog, PickRowThen};
use crate::schema;
use crate::value::RowValue;
use crate::views::sound;

/// Asks which row of `table` the new `module` names in its `field`, then adds it to `bundle`'s
/// insertion folder.
pub fn pick_then_add(editor: &mut Editor, bundle: &str, module: Value, table: &str, field: &str) {
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
            area: bundle.to_owned(),
            module,
            field: field.to_owned(),
        },
    }));
}

/// Adds `module` to `area` with the picked row's path in its `field`.
pub fn add_picked(editor: &mut Editor, area: &str, mut module: Value, field: &str, picked: &str) {
    module[field] = Value::String(picked.to_owned());
    let label = format!("Add {} to {area}", shapes::label(&module));
    nodes::add(editor, area, vec![module], &label);
}

pub fn listen(editor: &mut Editor, frame: &AreaFrame, tile: Pos<Tiles>) {
    let Some(area) = frame.area_id() else {
        return;
    };
    sound::listen(editor, &frame.content, area, tile);
    editor.panels.bottom = BottomTab::Listen;
}
