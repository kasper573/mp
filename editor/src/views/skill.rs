use std::collections::BTreeMap;

use egui::Ui;
use engine::field;
use engine::systems::class::SkillPoints;
use engine::systems::skill::{SkillDef, SkillLevel, SkillStat};
use serde_json::Value;

use crate::forms::{FormChange, FormCx};
use crate::ui::levels::{self, Level};

/// The rank cards of a skill row: each rank's point cost and the stats it adds, with the totals a
/// player at that rank sees.
pub fn ranks(ui: &mut Ui, cx: &mut FormCx, value: &mut Value) -> FormChange {
    let mut totals: BTreeMap<SkillStat, f32> = BTreeMap::new();
    levels::row_cards(
        ui,
        cx,
        value,
        field!(SkillDef, levels),
        skill_ranks,
        |_, rank| {
            for (stat, amount) in &rank.stats {
                *totals.entry(*stat).or_default() += amount;
            }
            let summed: Vec<String> = totals
                .iter()
                .map(|(stat, total)| format!("{} {total}", stat.label()))
                .collect();
            (!summed.is_empty()).then(|| format!("at this rank: {}", summed.join(" · ")))
        },
    )
}

fn skill_ranks(skill: &mut SkillDef) -> &mut Vec<SkillLevel> {
    &mut skill.levels
}

impl Level for SkillLevel {
    type Stat = SkillStat;
    const NAME: &'static str = "Rank";
    const STATS: &'static str = field!(SkillLevel, stats);

    fn stats(&mut self) -> &mut BTreeMap<SkillStat, f32> {
        &mut self.stats
    }

    fn unit(stat: SkillStat) -> Option<&'static str> {
        stat.unit()
    }

    fn next(_: Option<&SkillLevel>) -> SkillLevel {
        SkillLevel {
            cost: SkillPoints(1),
            stats: BTreeMap::new(),
        }
    }
}
