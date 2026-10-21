pub mod inspect;
pub mod tree;

use std::collections::HashMap;

use egui::Ui;
use engine::core::content::{ContentFile, fields_file};
use engine::systems::class::ClassDef;
use engine::systems::stat::StatKind;
use serde_json::Value;

use crate::app::Editor;
use crate::forms::{FormChange, FormCx};
use crate::project::{ContentEdit, RowSelection};
use crate::tabs::shown_path;
use crate::ui::levels::{self, LevelCards};
use crate::ui::{self, row_form, sidebar, theme, widgets};

pub const TREE_PART: &str = "/tree/";

const LEVELS: LevelCards<StatKind> = LevelCards {
    name: "Level",
    fields: &[("xp", 0), ("skill_points", 0)],
    next: |last| {
        let xp = last
            .and_then(|level| level["xp"].as_u64())
            .map_or(0, |xp| xp + 100);
        serde_json::json!({ "xp": xp, "stats": {}, "skill_points": 1 })
    },
    unit: StatKind::unit,
};

pub struct ClassViews {
    pub pages: HashMap<String, ClassPage>,
    /// Whether a dragged node or frame lands on the grid.
    pub snap: bool,
    pub drag: Option<tree::NodeDrag>,
    pub frame_drag: Option<tree::FrameDrag>,
}

impl Default for ClassViews {
    fn default() -> ClassViews {
        ClassViews {
            pages: HashMap::new(),
            snap: true,
            drag: None,
            frame_drag: None,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub enum ClassPage {
    #[default]
    Levels,
    Tree,
}

impl ClassViews {
    pub fn page(&self, key: &str) -> ClassPage {
        self.pages.get(key).copied().unwrap_or_default()
    }
}

pub fn show(editor: &mut Editor, ui: &mut Ui, key: &str) {
    if editor.row_value(key).is_none() {
        ui.label(theme::muted(format!("{} is gone", fields_file(key))));
        return;
    }
    let page = editor.views.class.page(key);
    let selection = editor.selection.clone();
    match page {
        ClassPage::Tree => sidebar::inspector(editor, ui, "class", |editor, ui| {
            if selection.keys.first().is_some_and(|k| k == key) && node_of(&selection).is_some() {
                inspect::show(editor, ui, &selection);
            } else {
                sidebar::nothing_selected(ui, "Select a skill in the tree to inspect it here.");
            }
        }),
        ClassPage::Levels => {}
    }
    egui::Frame::new()
        .inner_margin(ui::CONTENT_PADDING)
        .show(ui, |ui| {
            ui.set_min_size(ui.available_size());
            page_body(editor, ui, key, page);
        });
}

fn page_body(editor: &mut Editor, ui: &mut Ui, key: &str, page: ClassPage) {
    ui.horizontal(|ui| {
        for (target, label) in [
            (ClassPage::Levels, "levels"),
            (ClassPage::Tree, "skill tree"),
        ] {
            if widgets::mode_chip(ui, label, page == target).clicked() {
                editor.views.class.pages.insert(key.to_owned(), target);
                if target == ClassPage::Levels {
                    editor.select(RowSelection::row(ClassDef::TABLE, key));
                }
            }
        }
    });
    ui.add_space(4.0);
    match page {
        ClassPage::Levels => row_form::show_row_tab(editor, ui, ClassDef::TABLE, key),
        ClassPage::Tree => tree::show(editor, ui, key),
    }
}

pub fn node_of(selection: &RowSelection) -> Option<&str> {
    if selection.table != ClassDef::TABLE || selection.keys.len() != 1 {
        return None;
    }
    selection
        .parts
        .first()?
        .strip_prefix(TREE_PART)
        .filter(|node| !node.is_empty())
}

pub fn select_node(editor: &mut Editor, key: &str, node: Option<&str>) {
    match node {
        Some(node) => editor.select(RowSelection::parts(
            ClassDef::TABLE,
            key,
            vec![format!("{TREE_PART}{node}")],
        )),
        None => editor.select(RowSelection::row(ClassDef::TABLE, key)),
    }
}

pub fn write(editor: &mut Editor, key: &str, label: &str, value: &Value) {
    let mut edit = ContentEdit::new(format!("{label} · {}", shown_path(key)));
    edit.write_json(fields_file(key), value);
    editor.apply(edit);
}

pub fn levels(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> FormChange {
    levels::cards(ui, cx, value, &LEVELS, |index, level| {
        let xp = level["xp"].as_u64().unwrap_or(0);
        Some(if index == 0 && xp == 0 {
            "the start".to_owned()
        } else {
            format!("from {xp} xp")
        })
    })
}
