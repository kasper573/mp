use std::collections::HashSet;
use std::path::Path;

use engine::systems::actor::model::ModelDef;

use testkit::content;

const BUST_CAP_BYTES: u64 = 120 * 1024;
const CAST_BUDGET_BYTES: u64 = 3 * 1024 * 1024;

#[test]
fn every_bust_fits_the_download_budget() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../example_game/assets");
    let arts: HashSet<&str> = content()
        .table::<ModelDef>()
        .rows()
        .flat_map(|def| def.busts().into_iter().flat_map(|busts| busts.all()))
        .map(|bust| bust.as_str())
        .collect();
    let mut total = 0;
    for art in arts {
        let size = std::fs::metadata(root.join(art))
            .unwrap_or_else(|error| panic!("{art}: {error}"))
            .len();
        assert!(size <= BUST_CAP_BYTES, "{art} weighs {size} bytes");
        total += size;
    }
    assert!(total <= CAST_BUDGET_BYTES, "the busts weigh {total} bytes");
}
