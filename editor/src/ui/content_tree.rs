use egui::Ui;

use crate::app::Editor;

/// The content panel's tree of the game folder: what it is asked to do on its next draw.
#[derive(Default)]
pub struct ContentTree {
    pub search: String,
    pub focus_search: bool,
    /// A path to open the folders above, select and scroll to.
    pub reveal: Option<String>,
    /// A path whose name is being typed over, with what is typed so far.
    pub renaming: Option<(String, String)>,
    /// The paths selected in the tree, files and folders.
    pub selected: Vec<String>,
}

/// The folder new things land in: the folder selected in the tree, or the one holding what is
/// selected, or the top of the game folder.
pub fn current_folder(editor: &Editor) -> String {
    let Some(project) = &editor.project else {
        return String::new();
    };
    match editor.content_tree.selected.first() {
        Some(path) if project.files.index().folders.contains(path) => path.clone(),
        Some(path) => engine::core::content::parent_of(path).to_owned(),
        None => String::new(),
    }
}

pub fn focus_search(editor: &mut Editor) {
    editor.content_tree.focus_search = true;
}

/// Opens the folders above `path`, selects it and scrolls it into view.
pub fn reveal(editor: &mut Editor, path: &str) {
    editor.content_tree.reveal = Some(path.to_owned());
}

/// Reveals `path` with its name in an edit box, ready to type over.
pub fn begin_rename(editor: &mut Editor, path: &str) {
    reveal(editor, path);
    let name = engine::core::content::name_of(path).to_owned();
    editor.content_tree.renaming = Some((path.to_owned(), name));
}

pub fn show(editor: &mut Editor, ui: &mut Ui) {
    let _ = (editor, ui);
}
