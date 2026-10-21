use std::path::Path;

use editor::app::Editor;
use editor::app::content_version;
use editor::project::FileBytes;
use editor::project::journal::{RecoveryJournal, RecoveryJournalData, RecoveryJournalFile};
use editor::user::{EditorSettings, UserFolder};
use engine::core::content::fields_file;
use serde_json::json;
use testkit::path;

use crate::support;

#[test]
fn a_journal_the_folder_refuses_is_kept_aside_and_said_where() {
    let scratch = tempfile::tempdir().expect("scratch");
    let (mut editor, folder) = editor_on_camp(&scratch);
    let refused = journaled(
        &fields_file(&path("npc", "orc")),
        None,
        json!({ "name": "Orc", "not_a_field": true }),
    );
    write_journal(&editor, &folder, vec![refused]);

    let data = RecoveryJournal::recover(&editor.user, &folder).expect("a journal");
    editor.open_now(&folder, data.files);

    assert!(editor.project.is_some());
    let said = said(&editor);
    let aside = said
        .iter()
        .find_map(|line| {
            line.split_once("it is kept at ")
                .map(|(_, at)| at.to_owned())
        })
        .unwrap_or_else(|| panic!("says where the journal is kept: {said:?}"));
    let kept: RecoveryJournalData =
        serde_json::from_str(&std::fs::read_to_string(aside).expect("the journal is kept"))
            .expect("a journal");
    assert_eq!(kept.files.len(), 1);
    assert!(RecoveryJournal::recover(&editor.user, &folder).is_none());
}

#[test]
fn a_journal_that_breaks_a_file_it_never_wrote_is_kept_aside_too() {
    let scratch = tempfile::tempdir().expect("scratch");
    let folder = scratch.path().join("game");
    let crier = path("npc", "crier");
    support::game()
        .babble("crier")
        .npc(
            "crier",
            8.0,
            json!([{ "type": "voice", "babble": path("babble", "crier") }]),
        )
        .row(
            "notification",
            "call",
            json!({ "kind": { "type": "speech", "speaker": crier }, "text": ["Hear ye!"] }),
        )
        .write_to(&folder);
    let mut editor = Editor::new(
        UserFolder::at(scratch.path().join("user")),
        EditorSettings::default(),
    );
    let npc = fields_file(&crier);
    let mut fields: serde_json::Value =
        serde_json::from_slice(&std::fs::read(folder.join(&npc)).expect("the npc")).expect("json");
    fields["modules"] = json!([]);
    write_journal(&editor, &folder, vec![journaled(&npc, None, fields)]);

    let data = RecoveryJournal::recover(&editor.user, &folder).expect("a journal");
    editor.open_now(&folder, data.files);

    let said = said(&editor);
    assert!(
        said.iter().any(|line| line.contains("it is kept at ")),
        "{said:?}"
    );
    assert!(editor.project.as_ref().expect("a project").loads());
}

#[test]
fn recovering_a_file_changed_on_disk_since_says_saving_replaces_it() {
    let scratch = tempfile::tempdir().expect("scratch");
    let (mut editor, folder) = editor_on_camp(&scratch);
    let npc = fields_file(&path("npc", "orc"));
    let mut fields: serde_json::Value =
        serde_json::from_slice(&std::fs::read(folder.join(&npc)).expect("the npc")).expect("json");
    fields["name"] = json!("Grumpy orc");
    let file = journaled(&npc, Some("the bytes before"), fields);
    write_journal(&editor, &folder, vec![file]);

    let data = RecoveryJournal::recover(&editor.user, &folder).expect("a journal");
    editor.open_now(&folder, data.files);

    let said = said(&editor);
    assert!(
        said.iter()
            .any(|line| line.contains("changed on disk since") && line.contains(&npc)),
        "{said:?}"
    );
    assert!(editor.project.as_ref().expect("a project").loads());
}

fn editor_on_camp(scratch: &tempfile::TempDir) -> (Editor, std::path::PathBuf) {
    let folder = scratch.path().join("game");
    support::game()
        .npc("orc", 10.0, json!([]))
        .write_to(&folder);
    let editor = Editor::new(
        UserFolder::at(scratch.path().join("user")),
        EditorSettings::default(),
    );
    (editor, folder)
}

fn journaled(file: &str, base: Option<&str>, fields: serde_json::Value) -> RecoveryJournalFile {
    let bytes = serde_json::to_vec_pretty(&fields).expect("json");
    RecoveryJournalFile::of(file, base, Some(&FileBytes::from(bytes)))
}

fn write_journal(editor: &Editor, folder: &Path, files: Vec<RecoveryJournalFile>) {
    RecoveryJournal::for_folder(&editor.user, folder).write(&RecoveryJournalData {
        build: String::new(),
        content_version: content_version().to_owned(),
        folder: folder.to_path_buf(),
        written: std::time::SystemTime::now().into(),
        files,
    });
}

fn said(editor: &Editor) -> Vec<String> {
    editor
        .output
        .lines
        .iter()
        .map(|line| line.text.clone())
        .collect()
}
