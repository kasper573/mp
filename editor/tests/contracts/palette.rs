use editor::schema::SchemaShapes;
use editor::views::script::nodes::NodeCatalogue;
use engine::core::content::ContentRow;
use engine::systems::script::ScriptDef;

#[test]
fn every_node_names_its_system_and_says_what_it_does() {
    let shapes = SchemaShapes::load();
    let catalogue = NodeCatalogue::build(shapes.shape_of(ScriptDef::TABLE));
    assert!(catalogue.entries.len() > 40);
    for entry in &catalogue.entries {
        assert_ne!(entry.system, "other", "{} belongs to no system", entry.kind);
        assert!(
            !entry.blurb.is_empty(),
            "{} says nothing of itself",
            entry.kind
        );
        assert!(
            !entry.blurb.ends_with('.'),
            "{} reads as a sentence: {}",
            entry.kind,
            entry.blurb
        );
    }
}
