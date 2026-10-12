use game::core::math::Pos;
use game::core::tiling::{TilePos, Tiles};
use game::systems::area::AreaModuleKind;
use serde_json::Value;

use super::modules;
use super::placement::replace_with;
use super::{Frame, shapes};
use crate::app::{Dialog, Editor, PickRowDialog, PickRowThen};
use crate::project::{Edit, Selection, row_file};
use crate::value::RowValue;

pub fn drop_row(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    table: &str,
    key: &str,
    tile: Pos<Tiles>,
) {
    let candidates = super::preview::drop_candidates(editor, table);
    if candidates.is_empty() {
        editor.toast(format!("No area module takes a {table} row"));
        return;
    }
    if candidates.len() == 1 {
        let (kind, field) = &candidates[0];
        add_with_row(editor, view_key, frame, *kind, field, key, tile);
        return;
    }
    let view = editor.views.area.views.get_mut(view_key).expect("view");
    view.drop_menu = Some(super::DropMenu {
        table: table.to_owned(),
        key: key.to_owned(),
        at: tile,
        screen: frame.pointer.unwrap_or(frame.canvas.rect.center()),
        candidates,
    });
}

pub fn main_reference(editor: &Editor, kind: &str) -> Option<(String, String)> {
    let items = editor.shapes.modules_of("area")?;
    let root = &editor.shapes.table("area")?.shape;
    let crate::schema::Kind::Union(variants) = crate::schema::kind(root, items) else {
        return None;
    };
    let variant = variants.iter().find(|v| v.tag == kind)?;
    for (name, field) in crate::schema::properties(crate::schema::resolve(root, variant.schema)) {
        let field = crate::schema::resolve(root, field);
        if let Some(table) = crate::schema::table_of(field) {
            return Some((name.clone(), table.to_owned()));
        }
    }
    None
}

pub fn add_with_row(
    editor: &mut Editor,
    view_key: &str,
    frame: &Frame,
    kind: AreaModuleKind,
    field: &str,
    key: &str,
    tile: Pos<Tiles>,
) {
    let Some(mut module) = modules::variant_template(editor, kind.tag()) else {
        return;
    };
    module[field] = Value::String(key.to_owned());
    let cell = tile.cell();
    let (x, y) = (cell.x as f32, cell.y as f32);
    match kind {
        AreaModuleKind::Population => {
            module["roams"] = serde_json::json!({ "x": x - 2.0, "y": y - 2.0, "w": 4.0, "h": 4.0 });
            module["count"] = serde_json::json!(1);
        }
        AreaModuleKind::Resident => module["at"] = serde_json::json!({ "x": x, "y": y }),
        AreaModuleKind::Blueprint => {
            module["at"] = serde_json::json!({ "x": x, "y": y });
            editor
                .views
                .area
                .views
                .get_mut(view_key)
                .expect("view")
                .stamp = Some(key.to_owned());
        }
        AreaModuleKind::Scenery => module["at"] = serde_json::json!({ "x": x - 0.5, "y": y - 0.5 }),
        _ => {}
    }
    let label = shapes::label(&module);
    modules::append_modules(
        editor,
        frame,
        vec![module],
        &format!("Add {label} to {}", frame.area_key),
    );
}

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
