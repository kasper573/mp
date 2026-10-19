use engine::core::content::id::LeafKind;
use engine::core::content::row_file;
use engine::systems::registry;
use serde_json::json;

use crate::support::game;

#[test]
fn a_reference_is_placed_where_it_is_read_not_where_its_key_is_first_written() {
    let game = game().npc("wren", 10.0, json!([]));
    let folder = tempfile::tempdir().expect("a scratch folder");
    game.write_to(folder.path());
    let file = row_file("npc", "wren");
    let text = std::fs::read_to_string(folder.path().join(&file)).expect("the npc's file");
    assert!(text.find("\"name\"") < text.find("\"model\""), "{text}");
    let content = game.load();

    let references = registry().references(&content, &file, &text);

    let models: Vec<&str> = references
        .iter()
        .filter(|reference| reference.kind == LeafKind::Row("model"))
        .map(|reference| reference.pointer.as_str())
        .collect();
    assert_eq!(models, ["/model"]);
}
