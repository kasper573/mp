use editor::project::{ProjectFiles, json_bytes};
use engine::core::content::{ContentFile, RowName};
use engine::systems::player::snapshot::CharacterSnapshot;
use serde_json::{Value, json};

fn files() -> ProjectFiles {
    let mut files = ProjectFiles::default();
    let rows: [(&str, Value); 6] = [
        ("area/island", json!({})),
        ("area/bloomvale", json!({})),
        ("npc/bat", json!({})),
        ("npc/wren", json!({ "owner": "area/island" })),
        ("npc/farmer_girl", json!({ "owner": "area/bloomvale" })),
        ("quest/bone_tithe", json!({ "owner": "npc/wren" })),
    ];
    for (row, json) in rows {
        files.insert(format!("tables/{row}.json"), json_bytes(&json));
    }
    files
}

fn in_reach(files: &ProjectFiles, table: &str, reader: Option<&RowName>) -> Vec<String> {
    let mut keys: Vec<String> = files
        .keys_in_reach(table, reader)
        .map(str::to_owned)
        .collect();
    keys.sort();
    keys
}

#[test]
fn a_row_reaches_its_owners_local_rows_and_every_global_row() {
    let files = files();
    let island = RowName::new("area", "island");
    assert_eq!(in_reach(&files, "npc", Some(&island)), ["bat", "wren"]);
}

#[test]
fn a_local_row_reaches_what_its_owners_reach() {
    let files = files();
    let quest = RowName::new("quest", "bone_tithe");
    assert!(files.reaches(Some(&quest), "npc", "wren"));
    assert!(!files.reaches(Some(&quest), "npc", "farmer_girl"));
}

#[test]
fn global_content_reaches_only_global_rows() {
    let files = files();
    assert_eq!(in_reach(&files, "npc", None), ["bat"]);
}

#[test]
fn a_row_that_sees_all_rows_reaches_every_local_row() {
    let files = files();
    let character = RowName::new(CharacterSnapshot::TABLE, "hero");
    assert_eq!(
        in_reach(&files, "npc", Some(&character)),
        ["bat", "farmer_girl", "wren"]
    );
}

#[test]
fn an_owner_line_edited_in_reaches_at_once() {
    let mut files = files();
    let bloomvale = RowName::new("area", "bloomvale");
    assert!(!files.reaches(Some(&bloomvale), "npc", "wren"));
    files.insert(
        "tables/npc/wren.json".to_owned(),
        json_bytes(&json!({ "owner": "area/bloomvale" })),
    );
    assert!(files.reaches(Some(&bloomvale), "npc", "wren"));
}
