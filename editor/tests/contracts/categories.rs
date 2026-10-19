use editor::ui::categories::CATEGORIES;

#[test]
fn every_table_sits_in_exactly_one_category() {
    for table in engine::systems::registry().table_names() {
        let homes: Vec<&str> = CATEGORIES
            .iter()
            .filter(|category| category.tables.contains(&table))
            .map(|category| category.name)
            .collect();
        assert_eq!(homes.len(), 1, "{table} is in {homes:?}");
    }
}

#[test]
fn categories_name_only_tables_a_game_has() {
    let tables = engine::systems::registry().table_names();
    for category in CATEGORIES {
        for table in category.tables {
            assert!(tables.contains(table), "{} names {table}", category.name);
        }
    }
}
