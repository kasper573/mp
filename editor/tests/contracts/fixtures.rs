use editor::schema::SchemaShapes;
use serde_json::json;

#[test]
fn a_table_of_fixtures_alone_takes_no_rows_of_its_own_and_a_mixed_one_does() {
    let shapes = SchemaShapes::load();

    assert!(shapes.is_closed("input"));
    assert!(shapes.is_fixture("vfx_shader", "skill_area"));
    assert!(!shapes.is_closed("vfx_shader"));
    assert!(!shapes.is_closed("vfx"));
}

#[test]
fn a_fixture_keeps_the_parameter_the_engine_sets_with_its_name_and_kind_pinned() {
    let shapes = SchemaShapes::load();
    let locks = shapes.locks("vfx_shader", "skill_area");
    let hostile = json!({ "name": "hostile", "kind": "bool", "default": false });
    let color = json!({ "name": "color", "kind": "color", "default": [255, 255, 255, 255] });

    assert!(locks.iter().any(|lock| lock.keeps("/params", &hostile)));
    assert!(!locks.iter().any(|lock| lock.keeps("/params", &color)));
    let mut pinned: Vec<&str> = locks
        .iter()
        .flat_map(|lock| lock.pinned("/params", &hostile))
        .collect();
    pinned.sort_unstable();
    assert_eq!(pinned, vec!["kind", "name"]);
}

#[test]
fn an_input_fixture_takes_only_the_bindings_the_game_reads_for_it() {
    let shapes = SchemaShapes::load();
    let read = |key: &str| {
        shapes
            .locks("input", key)
            .iter()
            .find_map(|lock| lock.variants("/bindings"))
            .map(<[String]>::to_vec)
    };

    assert_eq!(read("carry_item"), Some(vec!["drag".to_owned()]));
    assert_eq!(read("raise_rank"), Some(vec!["click".to_owned()]));
    assert!(read("dismiss").is_some_and(|kinds| kinds.contains(&"key".to_owned())));
}
