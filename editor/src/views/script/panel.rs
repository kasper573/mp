use egui::{RichText, Stroke, Ui};
use game::core::content::Content;
use game::core::script::{OwnerKind, OwnerRow};
use game::systems::script::{Reach, RiftScripts};
use serde_json::Value;

use super::{Doc, Panel, ScriptOwner, run};
use crate::app::Editor;
use crate::project::{Selection, row_of};
use crate::tabs::Tab;
use crate::ui::{theme, widgets};
use crate::value::RowValue;

pub fn show(editor: &mut Editor, ui: &mut Ui, doc: &Doc, panel: Panel) {
    match panel {
        Panel::MayDo => may_do(editor, ui, doc),
        Panel::UsedBy => used_by(editor, ui, doc),
        Panel::Run => run::panel(editor, ui, doc),
        Panel::History => history(editor, ui, doc),
    }
}

pub struct Bound {
    pub label: String,
    pub row: OwnerRow,
    pub file: String,
}

pub fn bindings(editor: &Editor, doc: &Doc) -> Vec<Bound> {
    let Some(project) = &editor.project else {
        return Vec::new();
    };
    let Some(content) = project.content else {
        return Vec::new();
    };
    match &doc.owner {
        ScriptOwner::Inline {
            table,
            key,
            pointer,
        } => owner_row(&content, table, key, pointer)
            .into_iter()
            .collect(),
        ScriptOwner::Shared { key } => {
            let mut found = Vec::new();
            for usage in project.usages.of_row("script", key) {
                let Some((table, row_key)) = row_of(&usage.file) else {
                    continue;
                };
                if table == "script" {
                    continue;
                }
                let Some(pointer) = module_pointer(&usage.pointer) else {
                    continue;
                };
                if let Some(bound) = owner_row(&content, table, row_key, &pointer)
                    && !found.iter().any(|known: &Bound| known.row == bound.row)
                {
                    found.push(bound);
                }
            }
            found
        }
    }
}

fn module_pointer(pointer: &str) -> Option<String> {
    let rest = pointer.strip_prefix("/modules/")?;
    let mut parts = rest.split('/');
    let module = parts.next()?;
    let mut out = format!("/modules/{module}");
    if parts.next() == Some("scripts") {
        let script = parts.next()?;
        out.push_str(&format!("/scripts/{script}"));
    }
    Some(out)
}

pub fn owner_row(content: &Content, table: &str, key: &str, pointer: &str) -> Option<Bound> {
    use game::systems::area::AreaDef;
    use game::systems::area::blueprint::BlueprintDef;
    use game::systems::item::ItemDef;
    use game::systems::npc::NpcDef;
    use game::systems::quest::QuestDef;
    use game::systems::shop::ShopDef;
    let file = crate::project::row_file(table, key);
    let bound = |label: String, row: OwnerRow| Bound {
        label,
        row,
        file: file.clone(),
    };
    Some(match table {
        "npc" => bound(
            format!("npc/{key}"),
            OwnerRow {
                kind: OwnerKind::Npc,
                row: content.by_key::<NpcDef>(key)?.raw(),
                object: None,
            },
        ),
        "item" => bound(
            format!("item/{key}"),
            OwnerRow {
                kind: OwnerKind::Item,
                row: content.by_key::<ItemDef>(key)?.raw(),
                object: None,
            },
        ),
        "quest" => bound(
            format!("quest/{key}"),
            OwnerRow {
                kind: OwnerKind::Quest,
                row: content.by_key::<QuestDef>(key)?.raw(),
                object: None,
            },
        ),
        "shop" => bound(
            format!("shop/{key}"),
            OwnerRow {
                kind: OwnerKind::Shop,
                row: content.by_key::<ShopDef>(key)?.raw(),
                object: None,
            },
        ),
        "area" => {
            let area = content.by_key::<AreaDef>(key)?;
            match pointer
                .split('/')
                .nth(2)
                .and_then(|m| m.parse::<usize>().ok())
                .filter(|_| pointer.contains("/scripts/"))
            {
                Some(module) => {
                    let placed = game::systems::area::placed(content, area);
                    let index = placed
                        .iter()
                        .position(|p| p.chain.is_empty() && p.origin == module)?;
                    let name = match &placed[index].module {
                        game::systems::area::AreaModule::Object(object) => object
                            .name
                            .clone()
                            .or_else(|| object.label.clone())
                            .unwrap_or_else(|| "object".to_owned()),
                        _ => "object".to_owned(),
                    };
                    bound(
                        format!("area/{key} › {name}"),
                        OwnerRow {
                            kind: OwnerKind::Object,
                            row: area.raw(),
                            object: Some(index as u32),
                        },
                    )
                }
                None => bound(
                    format!("area/{key}"),
                    OwnerRow {
                        kind: OwnerKind::Area,
                        row: area.raw(),
                        object: None,
                    },
                ),
            }
        }
        "blueprint" => {
            let blueprint = content.by_key::<BlueprintDef>(key)?;
            let mut found = None;
            for area in content.ids::<AreaDef>() {
                for (ordinal, placement) in game::systems::area::placements(content, area)
                    .iter()
                    .enumerate()
                {
                    if placement.blueprint == blueprint && !placement.scripts.is_empty() {
                        found = Some(bound(
                            format!("blueprint/{key} in {} {ordinal}", area.key(content)),
                            OwnerRow {
                                kind: OwnerKind::Blueprint,
                                row: area.raw(),
                                object: Some(ordinal as u32),
                            },
                        ));
                        break;
                    }
                }
                if found.is_some() {
                    break;
                }
            }
            found?
        }
        _ => return None,
    })
}

fn may_do(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let Some(content) = editor.project.as_ref().and_then(|p| p.content) else {
        ui.label(theme::muted("The folder does not load"));
        return;
    };
    let bound = bindings(editor, doc);
    if bound.is_empty() {
        ui.label(theme::muted(if doc.is_shared() {
            "No owner names this script yet, so it may do nothing in play."
        } else {
            "No owner found for this script."
        }));
        return;
    }
    let pick_id = ui.id().with(("may-do-owner", doc.owner.slug()));
    let mut picked: usize = ui.ctx().data(|d| d.get_temp(pick_id)).unwrap_or(0);
    if bound.len() > 1 {
        ui.horizontal(|ui| {
            ui.label(theme::muted("as").size(13.0));
            egui::ComboBox::from_id_salt(pick_id)
                .selected_text(
                    theme::mono(
                        bound
                            .get(picked)
                            .map(|b| b.label.clone())
                            .unwrap_or_default(),
                    )
                    .size(13.0),
                )
                .show_ui(ui, |ui| {
                    for (index, owner) in bound.iter().enumerate() {
                        ui.selectable_value(&mut picked, index, &owner.label);
                    }
                });
            ui.label(
                theme::muted(format!("· one summary per owner, {} in all", bound.len())).size(12.5),
            );
        });
        ui.ctx().data_mut(|d| d.insert_temp(pick_id, picked));
        ui.add_space(4.0);
    }
    let Some(owner) = bound.get(picked).or(bound.first()) else {
        return;
    };
    let scripts = content.built::<RiftScripts>();
    let may = scripts.may_do(owner.row);
    let files = &editor.project.as_ref().expect("a project").files;
    let rows = may_do_rows(&content, doc, &may, files);
    let read_by = read_by_rows(&content, &may);
    let wide = ui.available_width() > 760.0 && !read_by.is_empty();
    egui::ScrollArea::vertical()
        .id_salt(("may-do", doc.owner.slug()))
        .show(ui, |ui| {
            ui.horizontal_top(|ui| {
                ui.vertical(|ui| {
                    ui.set_width(if wide {
                        ui.available_width() * 0.55
                    } else {
                        ui.available_width()
                    });
                    for (label, text, present) in &rows {
                        may_row(ui, label, text, *present);
                    }
                });
                if wide {
                    ui.add_space(16.0);
                    ui.vertical(|ui| {
                        ui.set_width(ui.available_width());
                        widgets::section(ui, "Read by");
                        for (who, what) in &read_by {
                            ui.horizontal(|ui| {
                                ui.add_sized(
                                    egui::vec2(96.0, 20.0),
                                    egui::Label::new(theme::strong(who).size(13.0)),
                                );
                                ui.add(egui::Label::new(theme::muted(what).size(13.0)).wrap());
                            });
                            let rect = ui.max_rect();
                            let y = ui.cursor().min.y;
                            ui.painter().line_segment(
                                [egui::pos2(rect.min.x, y), egui::pos2(rect.max.x, y)],
                                Stroke::new(1.0, theme::BORDER),
                            );
                        }
                    });
                }
            });
            if !wide && !read_by.is_empty() {
                ui.add_space(6.0);
            }
        });
}

fn may_row(ui: &mut Ui, label: &str, text: &str, present: bool) {
    ui.horizontal_top(|ui| {
        ui.add_sized(
            egui::vec2(120.0, 20.0),
            egui::Label::new(
                RichText::new(label.to_uppercase())
                    .size(11.5)
                    .color(theme::MUTED)
                    .family(egui::FontFamily::Name("medium".into())),
            ),
        );
        let rich = if present {
            RichText::new(text).size(13.0).color(theme::TEXT)
        } else {
            theme::muted(text).size(13.0)
        };
        ui.add(egui::Label::new(rich).wrap());
    });
    ui.add_space(2.0);
}

fn may_do_rows(
    content: &Content,
    doc: &Doc,
    may: &game::core::script::MayDo<game::systems::script::RiftScripting>,
    files: &crate::project::Files,
) -> Vec<(String, String, bool)> {
    let mut rows: Vec<(String, String, bool)> = Vec::new();
    let nodes = doc.nodes();
    let dialogue_count = nodes
        .values()
        .filter(|node| nodes_kind(node) == "dialogue")
        .count();
    let mut speakers: Vec<String> = nodes
        .values()
        .flat_map(|node| node["lines"].as_array().cloned().unwrap_or_default())
        .map(|line| super::nodes::speaker_name(&line["by"]))
        .collect();
    speakers.sort();
    speakers.dedup();
    let called_dialogue: usize = may
        .calls
        .iter()
        .filter_map(|script| files.json(&crate::project::row_file("script", script)))
        .map(|row| {
            row["nodes"]
                .as_object()
                .into_iter()
                .flatten()
                .filter(|(_, node)| nodes_kind(node) == "dialogue")
                .count()
        })
        .sum();
    if dialogue_count > 0 || called_dialogue > 0 {
        let by = match speakers.as_slice() {
            [] => String::new(),
            [one] if one == "narrator" => ", all by the narrator".to_owned(),
            [one] => format!(", all lines by npc/{one}"),
            many => format!(
                ", by {}",
                many.iter()
                    .map(|s| if s == "narrator" || s == "object" {
                        s.clone()
                    } else {
                        format!("npc/{s}")
                    })
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        };
        let more = if called_dialogue > 0 {
            format!(" · {called_dialogue} more through {}", may.calls.join(", "))
        } else {
            String::new()
        };
        rows.push((
            "says".to_owned(),
            format!(
                "{dialogue_count} dialogue node{} to the subject{by}{more}",
                crate::ui::widgets::plural(dialogue_count)
            ),
            true,
        ));
    }
    let shops: Vec<String> = may
        .reaches
        .iter()
        .filter_map(|r| match r {
            Reach::OpensShop(shop) => Some(format!("shop/{}", shop.key(content))),
            _ => None,
        })
        .collect();
    if !shops.is_empty() {
        rows.push((
            "opens".to_owned(),
            format!("{} for the subject", shops.join(", ")),
            true,
        ));
    }
    if !may.calls.is_empty() {
        let text = may
            .calls
            .iter()
            .map(|script| {
                let inner: Vec<String> = files
                    .json(&crate::project::row_file("script", script))
                    .map(|row| {
                        let mut quests: Vec<String> = Vec::new();
                        for (_, node) in row["nodes"].as_object().into_iter().flatten() {
                            for (kind, verb) in [
                                ("offer_quest", "offers"),
                                ("accept_quest", "accepts"),
                                ("turn_in", "turns in"),
                            ] {
                                if nodes_kind(node) == kind && !quests.iter().any(|q| q == verb) {
                                    quests.push(verb.to_owned());
                                }
                            }
                        }
                        quests
                    })
                    .unwrap_or_default();
                let quest = may.reaches.iter().find_map(|r| match r {
                    Reach::Offers(q) | Reach::Accepts(q) | Reach::TurnsIn(q) => {
                        Some(format!("quest/{}", q.key(content)))
                    }
                    _ => None,
                });
                match (inner.is_empty(), quest) {
                    (false, Some(quest)) => format!(
                        "script/{script}: {} {quest}",
                        inner.join(", ").replacen(", turns in", " and turns in", 1)
                    ),
                    _ => format!("script/{script}"),
                }
            })
            .collect::<Vec<_>>()
            .join(" · ");
        rows.push(("runs".to_owned(), text, true));
    }
    let reads = reads_of(doc);
    if !reads.is_empty() {
        rows.push(("reads".to_owned(), reads, true));
    }
    let warps: Vec<String> = may
        .reaches
        .iter()
        .filter_map(|r| match r {
            Reach::Warp(place) => Some(format!(
                "the subject to area/{} · {}, {} · sets its spawn point there",
                place.area.key(content),
                trim(place.at.x),
                trim(place.at.y)
            )),
            _ => None,
        })
        .collect();
    rows.push((
        "warps".to_owned(),
        if warps.is_empty() {
            "nowhere".to_owned()
        } else {
            warps.join(" · ")
        },
        !warps.is_empty(),
    ));
    let takes: Vec<String> = dedup(
        may.reaches
            .iter()
            .filter_map(|r| match r {
                Reach::Takes(item) => Some(stack_text(doc, "take", item.key(content))),
                _ => None,
            })
            .collect(),
    );
    let gives: Vec<String> = dedup(
        may.reaches
            .iter()
            .filter_map(|r| match r {
                Reach::Gives(item) => Some(stack_text(doc, "give", item.key(content))),
                _ => None,
            })
            .collect(),
    );
    if !takes.is_empty() || !gives.is_empty() {
        rows.push((
            "takes".to_owned(),
            if takes.is_empty() {
                "nothing".to_owned()
            } else {
                format!("from the subject: {}", takes.join(", "))
            },
            !takes.is_empty(),
        ));
        rows.push((
            "gives".to_owned(),
            if gives.is_empty() {
                "nothing".to_owned()
            } else {
                format!("the subject {}", gives.join(", "))
            },
            !gives.is_empty(),
        ));
    }
    let drops: Vec<String> = dedup(
        may.reaches
            .iter()
            .filter_map(|r| match r {
                Reach::Drops(item) => Some(item.key(content).to_owned()),
                _ => None,
            })
            .collect(),
    );
    if !drops.is_empty() {
        rows.push((
            "drops".to_owned(),
            format!("{} at the owner, reserved to the subject", drops.join(", ")),
            true,
        ));
    }
    let memories: Vec<String> = dedup(
        may.reaches
            .iter()
            .filter_map(|r| match r {
                Reach::Remembers(memory) => Some(memory.key(content).to_owned()),
                _ => None,
            })
            .collect(),
    );
    if !memories.is_empty() {
        rows.push((
            "remembers".to_owned(),
            format!("the subject's {}", memories.join(", ")),
            true,
        ));
    }
    let notices: Vec<String> = dedup(
        may.reaches
            .iter()
            .filter_map(|r| match r {
                Reach::Notifies(n) => Some(format!("notification/{}", n.key(content))),
                _ => None,
            })
            .collect(),
    );
    if !notices.is_empty() {
        rows.push(("notifies".to_owned(), notices.join(", "), true));
    }
    let mut quests: Vec<(String, Vec<&str>)> = Vec::new();
    for reach in &may.reaches {
        let (verb, quest) = match reach {
            Reach::Offers(q) => ("offers", q),
            Reach::Accepts(q) => ("accepts", q),
            Reach::TurnsIn(q) => ("turns in", q),
            Reach::Fails(q) => ("fails", q),
            Reach::Completes(q) => ("completes a task of", q),
            _ => continue,
        };
        let key = quest.key(content).to_owned();
        match quests.iter_mut().find(|(q, _)| *q == key) {
            Some((_, verbs)) => {
                if !verbs.contains(&verb) {
                    verbs.push(verb);
                }
            }
            None => quests.push((key, vec![verb])),
        }
    }
    if !quests.is_empty() {
        let text = quests
            .iter()
            .map(|(quest, verbs)| {
                let verbs = match verbs.as_slice() {
                    [one] => (*one).to_owned(),
                    [head @ .., last] => format!("{} and {last}", head.join(", ")),
                    [] => String::new(),
                };
                format!("{verbs} quest/{quest}")
            })
            .collect::<Vec<_>>()
            .join(" · ");
        rows.push(("quests".to_owned(), text, true));
    }
    let mut npcs: Vec<String> = Vec::new();
    for reach in &may.reaches {
        match reach {
            Reach::Spawns(npc) => npcs.push(format!("spawns npc/{}", npc.key(content))),
            Reach::Hostile => npcs.push("may turn hostile".to_owned()),
            Reach::Friendly => npcs.push("may turn friendly".to_owned()),
            Reach::Despawns => npcs.push("despawns".to_owned()),
            Reach::Walks => npcs.push("walks".to_owned()),
            Reach::Targets | Reach::Damages => npcs.push("attacks".to_owned()),
            _ => {}
        }
    }
    npcs.dedup();
    if !npcs.is_empty() {
        rows.push(("npcs".to_owned(), npcs.join(" · "), true));
    }
    let mut stats: Vec<String> = Vec::new();
    for reach in &may.reaches {
        match reach {
            Reach::Heals => stats.push("heals".to_owned()),
            Reach::Buffs => stats.push("buffs".to_owned()),
            Reach::GrantsXp => stats.push("grants xp".to_owned()),
            Reach::SetsJob(job) => stats.push(format!("sets job {}", job.key(content))),
            Reach::Plays(sfx) => stats.push(format!("plays {}", sfx.key(content))),
            Reach::Says => stats.push("says a chat line".to_owned()),
            _ => {}
        }
    }
    if !stats.is_empty() {
        rows.push(("also".to_owned(), stats.join(" · "), true));
    }
    let mut waits: Vec<String> = Vec::new();
    if dialogue_count > 0 || called_dialogue > 0 {
        waits.push("choices".to_owned());
    }
    if !shops.is_empty() {
        waits.push("the shop".to_owned());
    }
    if may
        .reaches
        .iter()
        .any(|r| matches!(r, Reach::TurnsIn(_) | Reach::Offers(_)))
    {
        waits.push("the quest card".to_owned());
    }
    let seconds: Vec<String> = nodes
        .values()
        .filter(|node| nodes_kind(node) == "wait")
        .filter_map(|node| node["seconds"].as_f64())
        .map(|s| format!("{} s", trim(s as f32)))
        .collect();
    if !seconds.is_empty() {
        waits.push(seconds.join(", "));
    }
    rows.push((
        "waits".to_owned(),
        if waits.is_empty() {
            "never".to_owned()
        } else if seconds.len() == waits.len() {
            waits.join(" · ")
        } else {
            format!("for the subject: {}", waits.join(", "))
        },
        !waits.is_empty(),
    ));
    rows
}

fn dedup(list: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for item in list {
        if !out.contains(&item) {
            out.push(item);
        }
    }
    out
}

fn nodes_kind(node: &Value) -> &str {
    node.kind()
}

fn trim(number: f32) -> String {
    if number.fract() == 0.0 {
        format!("{}", number as i64)
    } else {
        format!("{number}")
    }
}

fn stack_text(doc: &Doc, field: &str, item: &str) -> String {
    for node in doc.nodes().values() {
        for stack in node[field].as_array().into_iter().flatten() {
            if stack["item"].as_str() == Some(item) {
                let count = stack["count"].as_u64().unwrap_or(1);
                return format!("{count} {item}");
            }
        }
    }
    item.to_owned()
}

fn reads_of(doc: &Doc) -> String {
    fn walk(
        value: &Value,
        memories: &mut Vec<String>,
        items: &mut Vec<String>,
        places: &mut Vec<String>,
        other: &mut Vec<String>,
    ) {
        match value {
            Value::Object(map) => {
                match map.get("type").and_then(Value::as_str) {
                    Some("memory") | Some("set_within") => {
                        if let Some(name) = map.get("memory").and_then(Value::as_str) {
                            memories.push(name.to_owned());
                        }
                    }
                    Some("holding") | Some("wearing") => {
                        if let Some(item) = map.get("item").and_then(Value::as_str) {
                            items.push(format!("holding {item}"));
                        }
                    }
                    Some("inside") | Some("in_area") | Some("knows_area") => {
                        let area = map.get("area").and_then(Value::as_str).unwrap_or("?");
                        let object = map
                            .get("object")
                            .and_then(Value::as_str)
                            .map(|o| format!(" · {o}"))
                            .unwrap_or_default();
                        places.push(format!("inside area/{area}{object}"));
                    }
                    Some("on_quest") | Some("quest_done") | Some("task_done") => {
                        if let Some(quest) = map.get("quest").and_then(Value::as_str) {
                            other.push(format!("quest/{quest}"));
                        }
                    }
                    Some("level") => other.push("the level".to_owned()),
                    _ => {}
                }
                for child in map.values() {
                    walk(child, memories, items, places, other);
                }
            }
            Value::Array(list) => {
                for child in list {
                    walk(child, memories, items, places, other);
                }
            }
            _ => {}
        }
    }
    let (mut memories, mut items, mut places, mut other) =
        (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for node in doc.nodes().values() {
        if let Some(test) = node.get("test") {
            walk(test, &mut memories, &mut items, &mut places, &mut other);
        }
        for choice in node["choices"].as_array().into_iter().flatten() {
            if let Some(requires) = choice.get("requires") {
                walk(requires, &mut memories, &mut items, &mut places, &mut other);
            }
        }
    }
    for list in [&mut memories, &mut items, &mut places, &mut other] {
        list.sort();
        list.dedup();
    }
    let mut parts: Vec<String> = Vec::new();
    if !memories.is_empty() {
        parts.push(format!("the subject's memory {}", memories.join(", ")));
    }
    parts.extend(items);
    parts.extend(places);
    parts.extend(other);
    parts.join(" · ")
}

fn read_by_rows(
    content: &Content,
    may: &game::core::script::MayDo<game::systems::script::RiftScripting>,
) -> Vec<(String, String)> {
    let mut rows = Vec::new();
    let warps: Vec<&game::systems::script::Place> = may
        .reaches
        .iter()
        .filter_map(|r| match r {
            Reach::Warp(place) => Some(place),
            _ => None,
        })
        .collect();
    if let Some(place) = warps.first() {
        rows.push((
            "World map".to_owned(),
            format!("a route to {} (P5)", place.area.key(content)),
        ));
        rows.push((
            "Area view".to_owned(),
            format!(
                "{} · arrival pin at {}, {} (H10)",
                place.area.key(content),
                trim(place.at.x),
                trim(place.at.y)
            ),
        ));
        rows.push((
            "Loader".to_owned(),
            format!(
                "{}'s {}, {} is a valid place (spec)",
                place.area.key(content),
                trim(place.at.x),
                trim(place.at.y)
            ),
        ));
    }
    let quests: Vec<String> = may
        .reaches
        .iter()
        .filter_map(|r| match r {
            Reach::Offers(q) | Reach::Accepts(q) | Reach::TurnsIn(q) => {
                Some(q.key(content).to_owned())
            }
            _ => None,
        })
        .collect();
    if !quests.is_empty() {
        rows.push((
            "Quest log".to_owned(),
            format!("given by and turned in at, for {} (L13)", quests.join(", ")),
        ));
        rows.push((
            "World map".to_owned(),
            "quest marks on this owner (P5)".to_owned(),
        ));
    }
    let items: Vec<String> = may
        .reaches
        .iter()
        .filter_map(|r| match r {
            Reach::Takes(i) | Reach::Gives(i) | Reach::Drops(i) => Some(i.key(content).to_owned()),
            _ => None,
        })
        .collect();
    if !items.is_empty() {
        let mut items = items;
        items.sort();
        items.dedup();
        rows.push((
            "Item sources".to_owned(),
            format!("{} change hands here (P2)", items.join(", ")),
        ));
    }
    rows
}

pub fn describe_reach(content: &Content, reach: &Reach) -> String {
    match reach {
        Reach::Warp(place) => format!(
            "warps to {} {}, {}",
            place.area.key(content),
            place.at.x,
            place.at.y
        ),
        Reach::Takes(item) => format!("takes {}", item.key(content)),
        Reach::Gives(item) => format!("gives {}", item.key(content)),
        Reach::Drops(item) => format!("drops {}", item.key(content)),
        Reach::Offers(quest) => format!("offers quest {}", quest.key(content)),
        Reach::Accepts(quest) => format!("accepts quest {}", quest.key(content)),
        Reach::TurnsIn(quest) => format!("turns in quest {}", quest.key(content)),
        Reach::Fails(quest) => format!("fails quest {}", quest.key(content)),
        Reach::Completes(quest) => format!("completes a task of {}", quest.key(content)),
        Reach::Remembers(memory) => format!("remembers {}", memory.key(content)),
        Reach::OpensShop(shop) => format!("opens shop {}", shop.key(content)),
        Reach::Spawns(npc) => format!("spawns {}", npc.key(content)),
        Reach::Hostile => "may turn hostile".to_owned(),
        Reach::Friendly => "may turn friendly".to_owned(),
        Reach::Despawns => "despawns".to_owned(),
        Reach::Targets => "targets actors".to_owned(),
        Reach::Walks => "walks".to_owned(),
        Reach::Damages => "damages".to_owned(),
        Reach::Heals => "heals".to_owned(),
        Reach::Buffs => "buffs".to_owned(),
        Reach::GrantsXp => "grants xp".to_owned(),
        Reach::SetsJob(job) => format!("sets job {}", job.key(content)),
        Reach::Notifies(notification) => format!("notifies {}", notification.key(content)),
        Reach::Says => "says".to_owned(),
        Reach::Plays(sfx) => format!("plays {}", sfx.key(content)),
        Reach::Speaks(npc) => format!("speaks as {}", npc.key(content)),
    }
}

fn used_by(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let mut open: Option<(String, String, Option<String>)> = None;
    match &doc.owner {
        ScriptOwner::Inline {
            table,
            key,
            pointer,
        } => {
            let response = ui
                .horizontal(|ui| {
                    ui.label(theme::code(format!("{table}/{key}")).size(13.0));
                    ui.label(theme::muted("holds it in its own row").size(13.0));
                })
                .response
                .interact(egui::Sense::click());
            if response
                .on_hover_cursor(egui::CursorIcon::PointingHand)
                .clicked()
            {
                open = Some((table.clone(), key.clone(), Some(pointer.clone())));
            }
        }
        ScriptOwner::Shared { key } => {
            let Some(project) = &editor.project else {
                return;
            };
            let mut rows: Vec<(String, String, Option<String>, String, String)> = Vec::new();
            for (file, pointers) in project.usages.files_naming("script", key) {
                let row = project.files.json(&file);
                let Some((table, row_key)) = row_of(&file) else {
                    continue;
                };
                for pointer in pointers {
                    let module_pointer = module_pointer(&pointer);
                    let module = module_pointer
                        .as_ref()
                        .and_then(|p| row.as_ref().and_then(|row| row.pointer(p)).cloned());
                    let (name, what) = if pointer.contains("/nodes/") {
                        (
                            pointer.rsplit('/').nth(1).unwrap_or("").to_owned(),
                            "run node".to_owned(),
                        )
                    } else {
                        let object = pointer
                            .strip_prefix("/modules/")
                            .and_then(|rest| rest.split('/').next())
                            .and_then(|i| i.parse::<usize>().ok())
                            .and_then(|i| {
                                row.as_ref().and_then(|row| {
                                    row["modules"][i]["name"].as_str().map(str::to_owned)
                                })
                            });
                        let values = module
                            .as_ref()
                            .map(|m| summarise_values(&m["values"]))
                            .unwrap_or_default();
                        (object.unwrap_or_default(), values)
                    };
                    rows.push((
                        format!("{table}/{row_key}"),
                        name,
                        module_pointer,
                        what,
                        file.clone(),
                    ));
                }
            }
            if rows.is_empty() {
                widgets::hint(ui, "Nothing names this script yet.");
                return;
            }
            let areas: std::collections::BTreeSet<&str> = rows
                .iter()
                .map(|(owner, _, _, _, _)| owner.as_str())
                .collect();
            let shown = 8;
            egui::ScrollArea::vertical()
                .id_salt(("used-by", key))
                .show(ui, |ui| {
                    for (owner, name, module_pointer, what, _) in rows.iter().take(shown) {
                        let response = ui
                            .horizontal(|ui| {
                                ui.add_sized(
                                    egui::vec2(150.0, 20.0),
                                    egui::Label::new(theme::code(owner).size(13.0)).truncate(),
                                );
                                ui.add_sized(
                                    egui::vec2(120.0, 20.0),
                                    egui::Label::new(theme::mono(name).size(13.0)).truncate(),
                                );
                                ui.label(theme::muted(what).size(13.0));
                            })
                            .response
                            .interact(egui::Sense::click());
                        if response
                            .on_hover_cursor(egui::CursorIcon::PointingHand)
                            .clicked()
                            && let Some((table, row_key)) = owner.split_once('/')
                        {
                            open = Some((
                                table.to_owned(),
                                row_key.to_owned(),
                                module_pointer.clone(),
                            ));
                        }
                        let rect = ui.max_rect();
                        let y = ui.cursor().min.y;
                        ui.painter().line_segment(
                            [egui::pos2(rect.min.x, y), egui::pos2(rect.max.x, y)],
                            Stroke::new(1.0, theme::BORDER),
                        );
                    }
                    if rows.len() > shown {
                        let all_areas = areas.iter().all(|a| a.starts_with("area/"));
                        ui.label(
                            theme::muted(format!(
                                "… {} more in {} {} · click one to open its {}",
                                rows.len() - shown,
                                areas.len(),
                                counted(areas.len(), if all_areas { "area" } else { "owner" }),
                                if all_areas {
                                    "area with it selected"
                                } else {
                                    "row"
                                }
                            ))
                            .monospace()
                            .size(12.5),
                        );
                    } else {
                        ui.label(
                            theme::muted("click one to open its row")
                                .monospace()
                                .size(12.5),
                        );
                    }
                });
        }
    }
    if let Some((table, key, pointer)) = open {
        match pointer {
            Some(pointer) if table == "area" && !pointer.contains("/scripts/") => {
                editor.select(Selection {
                    table: table.clone(),
                    keys: vec![key.clone()],
                    parts: vec![
                        pointer
                            .rsplit_once("/scripts")
                            .map(|(m, _)| m.to_owned())
                            .unwrap_or(pointer),
                    ],
                });
                editor.open_tab(Tab::Area { key });
            }
            Some(pointer) if !pointer.is_empty() => {
                editor.select(Selection::row(&table, &key));
                super::open_inline_or_row(editor, &table, &key, &pointer);
            }
            _ => {
                editor.select(Selection::row(&table, &key));
                editor.open_tab(Tab::for_row(&table, &key));
            }
        }
    }
}

fn counted(count: usize, word: &str) -> String {
    if count == 1 {
        word.to_owned()
    } else {
        format!("{word}s")
    }
}

pub fn used_by_count(editor: &Editor, owner: &ScriptOwner) -> usize {
    match owner {
        ScriptOwner::Inline { .. } => 1,
        ScriptOwner::Shared { key } => editor
            .project
            .as_ref()
            .map_or(0, |project| project.usages.of_row("script", key).len()),
    }
}

fn summarise_values(values: &Value) -> String {
    values
        .as_object()
        .map(|map| {
            map.iter()
                .map(|(name, value)| match value {
                    Value::Object(place)
                        if place.contains_key("area") && place.contains_key("x") =>
                    {
                        format!(
                            "{name} {} · {}, {}",
                            place.text_or("area", "?"),
                            trim(place["x"].as_f64().unwrap_or(0.0) as f32),
                            trim(place["y"].as_f64().unwrap_or(0.0) as f32)
                        )
                    }
                    other => format!("{name} {}", crate::condition::summary(other)),
                })
                .collect::<Vec<_>>()
                .join(" · ")
        })
        .unwrap_or_default()
}

fn history(editor: &mut Editor, ui: &mut Ui, doc: &Doc) {
    let Some(project) = &editor.project else {
        return;
    };
    let applied = project.history.applied();
    let steps: Vec<(usize, String, bool)> = project
        .history
        .steps()
        .iter()
        .enumerate()
        .filter(|(_, step)| step.after.iter().any(|change| change.file == doc.file))
        .map(|(index, step)| (index + 1, step.label.clone(), index < applied))
        .collect();
    if steps.is_empty() {
        ui.label(RichText::new("No steps touched this script yet").weak());
        return;
    }
    let mut jump = None;
    egui::ScrollArea::vertical()
        .id_salt(("script-history", doc.owner.slug()))
        .show(ui, |ui| {
            for (index, label, done) in steps.iter().rev() {
                let text = if *done {
                    RichText::new(label)
                } else {
                    RichText::new(label).weak()
                };
                if ui.selectable_label(*index == applied, text).clicked() {
                    jump = Some(*index);
                }
            }
        });
    if let Some(index) = jump
        && let Some(project) = &mut editor.project
    {
        match project.jump(index) {
            Ok(Some(applied)) => {
                editor.selection = applied.viewpoint.selection;
                editor.views.restore_camera(applied.viewpoint.camera);
                editor.views.content_changed();
            }
            Ok(None) => {}
            Err(refusal) => editor.refused("History", &refusal),
        }
    }
}
