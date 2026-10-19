use std::collections::BTreeMap;

use egui::Ui;
use engine::systems::skill::SkillStat;
use serde_json::Value;

use crate::forms::{FormChange, FormCx};
use crate::ui::levels::{self, LevelCards};

const RANKS: LevelCards<SkillStat> = LevelCards {
    name: "Rank",
    fields: &[("cost", 1)],
    next: |_| serde_json::json!({ "cost": 1, "stats": {} }),
    unit: SkillStat::unit,
};

/// The rank cards of a skill row: each rank's point cost and the stats it adds, with the totals a
/// player at that rank sees.
pub fn ranks(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> FormChange {
    let mut totals: BTreeMap<String, f32> = BTreeMap::new();
    levels::cards(ui, cx, value, &RANKS, |_, rank| {
        for (key, amount) in rank["stats"].as_object().into_iter().flatten() {
            *totals.entry(key.clone()).or_default() += amount.as_f64().unwrap_or(0.0) as f32;
        }
        let summed: Vec<String> = totals
            .iter()
            .map(|(key, total)| format!("{key} {total}"))
            .collect();
        (!summed.is_empty()).then(|| format!("at this rank: {}", summed.join(" · ")))
    })
}
