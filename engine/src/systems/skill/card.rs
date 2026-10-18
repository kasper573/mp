use bevy::prelude::*;
use bevy_egui::EguiPrimaryContextPass;
use design_tokens::{TextRole, color};
use egui::{Response, RichText, Ui};

use super::{Rank, SkillDef, SkillId, SkillKind, SkillStat};
use crate::core::content::Content;
use crate::core::gui::{self, Band};
use crate::core::text::{self, StyledLine, TextLook};
use crate::systems::class::{self, ClassId, NodeKey};
use crate::systems::hud;
use crate::systems::item::Inventory;
use crate::systems::player::session;
use crate::systems::screen::ClientScreen;
use crate::systems::script::condition;
use crate::systems::skill::Learned;
use crate::systems::text::counted;

pub(crate) const BASIC_ATTACK_MARK: &str = "basic attack";

const WINDOW_KEY: &str = "Skill";
const ICON: f32 = 40.0;

/// One skill as the player sees it: the row at the rank they hold, with the node that unlocks it
/// when it sits in their tree.
#[derive(Clone, Debug, PartialEq)]
pub struct SkillCard {
    pub skill: SkillId,
    pub rank: Rank,
    pub node: Option<NodeAccess>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NodeAccess {
    pub class: ClassId,
    pub node: NodeKey,
}

pub struct SkillCardPlugin;

impl Plugin for SkillCardPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<hud::Pinned<SkillId>>()
            .add_systems(
                Update,
                hud::raise_pinned::<SkillId>(WINDOW_KEY).run_if(in_state(ClientScreen::Area)),
            )
            .add_systems(
                EguiPrimaryContextPass,
                draw_card
                    .in_set(Band::Hud)
                    .run_if(in_state(ClientScreen::Area)),
            )
            .add_systems(OnExit(ClientScreen::Area), hud::forget_pinned::<SkillId>);
    }
}

pub fn open(world: &mut World, skill: SkillId) {
    hud::pin(world, skill);
}

pub fn close(world: &mut World) -> bool {
    hud::unpin::<SkillId>(world)
}

pub fn showing(world: &World) -> bool {
    hud::pinned::<SkillId>(world).is_some()
}

pub fn layer() -> egui::LayerId {
    hud::window_layer(WINDOW_KEY)
}

/// The card of a skill as the player's own character knows it.
pub fn of(world: &World, skill: SkillId) -> SkillCard {
    let content = world.resource::<Content>();
    let me = session::me(world);
    let rank = me.map_or(Rank::NONE, |me| super::rank_of(world, me, skill));
    let node = me.and_then(|me| class::of(world, me)).and_then(|class| {
        class
            .get(content)
            .tree
            .node_of(skill)
            .map(|(key, _)| NodeAccess {
                class,
                node: key.clone(),
            })
    });
    SkillCard { skill, rank, node }
}

pub fn tooltip(
    response: &Response,
    world: &mut World,
    card: &SkillCard,
    hint: Option<&StyledLine>,
) {
    gui::tooltip(response, |ui| {
        ui.set_max_width(hud::TOOLTIP_WIDTH);
        sheet(ui, world, card);
        if let Some(hint) = hint {
            ui.add_space(4.0);
            let look = TextLook {
                size: TextRole::Small.size(),
                color: color::MUTED,
            };
            text::show(ui, world, hint, look, None);
        }
    });
}

pub fn sheet(ui: &mut Ui, world: &mut World, card: &SkillCard) {
    let content = world.resource::<Content>().clone();
    let def = card.skill.get(&content);
    ui.spacing_mut().item_spacing.y = 6.0;
    ui.horizontal(|ui| {
        hud::icon(ui, world, &def.icon, ICON);
        ui.vertical(|ui| {
            ui.label(RichText::new(def.name.as_str()).font(TextRole::Heading.font_id()));
            ui.label(
                RichText::new(format!("Rank {} of {}", card.rank.0, def.rank_count()))
                    .size(TextRole::Small.size())
                    .color(color::MUTED),
            );
        });
    });
    ui.label(
        RichText::new(use_line(def, card.rank))
            .size(TextRole::Small.size())
            .color(color::TEXT.gamma_multiply(0.85)),
    );
    for (index, level) in def.levels.iter().enumerate() {
        let rank = Rank(index as u8 + 1);
        let lit = rank <= card.rank;
        let ink = if lit { color::TEXT } else { color::FAINT };
        ui.label(RichText::new(rank_line(def, rank, level.cost.0)).color(ink));
    }
    if let Some(access) = &card.node {
        let lines = access_lines(world, &content, access);
        if !lines.is_empty() {
            section(ui, "Unlocked by");
            for (line, met) in lines {
                requirement(ui, &line, met);
            }
        }
    }
    section(ui, "To use");
    let needs = use_lines(world, &content, def);
    if needs.is_empty() {
        ui.label(RichText::new("Nothing needed").color(color::MUTED));
    }
    for (line, met) in needs {
        requirement(ui, &line, met);
    }
}

fn draw_card(world: &mut World) {
    hud::draw_pinned::<SkillId>(world, WINDOW_KEY, |ui, world, skill| {
        let card = of(world, *skill);
        sheet(ui, world, &card);
    });
}

fn use_line(def: &SkillDef, rank: Rank) -> String {
    if def.kind == SkillKind::Passive {
        return "Passive · holds while known".to_owned();
    }
    let rank = rank.max(Rank::FIRST);
    let mut parts = vec![def.target.describe().to_owned()];
    if let Some(shape) = def.area_at(rank) {
        parts.push(shape.describe());
    }
    if let Some(range) = def.range {
        parts.push(format!(
            "{} tiles",
            range.0 + def.stat(rank, SkillStat::Range)
        ));
    }
    let cooldown = def.cooldown_at(rank);
    if cooldown.0 > 0.0 {
        parts.push(format!("{} s cooldown", trim(cooldown.0)));
    }
    parts.join(" · ")
}

fn rank_line(def: &SkillDef, rank: Rank, cost: u32) -> String {
    let level = &def.levels[usize::from(rank.0) - 1];
    let mut line = format!("Rank {} · {}", rank.0, counted(cost, "point"));
    let changes: Vec<String> = level
        .stats
        .iter()
        .map(|(stat, value)| {
            let unit = stat.unit().map_or(String::new(), |unit| format!(" {unit}"));
            format!("{} {}{unit}", stat.label(), signed(*value))
        })
        .collect();
    if !changes.is_empty() {
        line.push_str(": ");
        line.push_str(&changes.join(", "));
    }
    line
}

fn access_lines(world: &World, content: &Content, access: &NodeAccess) -> Vec<(String, bool)> {
    let class = access.class.get(content);
    let Some(node) = class.tree.node(&access.node) else {
        return Vec::new();
    };
    let me = session::me(world);
    let held = me
        .and_then(|me| world.get::<Learned>(me))
        .cloned()
        .unwrap_or_default();
    node.requires
        .iter()
        .map(|requirement| {
            let met = me.is_some_and(|me| requirement.met(world, me, class, &held.0));
            (requirement.describe(content, &class.tree), met)
        })
        .collect()
}

fn use_lines(world: &World, content: &Content, def: &SkillDef) -> Vec<(String, bool)> {
    let me = session::me(world);
    let mut lines: Vec<(String, bool)> = def
        .requires
        .iter()
        .flat_map(condition::parts)
        .map(|part| {
            let met = me.is_some_and(|me| condition::holds(world, me, part));
            (condition::describe(content, part), met)
        })
        .collect();
    let bag = me.and_then(|me| world.get::<Inventory>(me));
    for stack in &def.cost {
        let held = bag.map_or(0, |bag| bag.count(stack.item));
        lines.push((
            format!(
                "Spends {} {} ({held} held)",
                stack.count,
                stack.item.get(content).name
            ),
            held >= stack.count,
        ));
    }
    lines
}

fn section(ui: &mut Ui, title: &str) {
    ui.add_space(2.0);
    ui.label(
        RichText::new(title)
            .size(TextRole::Small.size())
            .family(design_tokens::family::medium())
            .color(color::MUTED),
    );
}

fn requirement(ui: &mut Ui, line: &str, met: bool) {
    let (mark, ink) = if met {
        ("✓", color::OK)
    } else {
        ("✗", color::DANGER)
    };
    ui.horizontal(|ui| {
        ui.label(RichText::new(mark).color(ink));
        ui.label(RichText::new(line).color(color::TEXT));
    });
}

fn signed(value: f32) -> String {
    let text = trim(value.abs());
    if value < 0.0 {
        format!("−{text}")
    } else {
        format!("+{text}")
    }
}

fn trim(value: f32) -> String {
    let rounded = (value * 100.0).round() / 100.0;
    if rounded.fract() == 0.0 {
        format!("{rounded:.0}")
    } else {
        format!("{rounded}")
    }
}
