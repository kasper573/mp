use design_tokens::glyph::{self, Mark};
use egui::{Color32, RichText, Stroke, Ui};
use engine::core::script::{ExprKind, ValueType};
use engine::systems::script::RiftQueryKind;
use serde_json::Value;
use strum::VariantArray;

use crate::forms::{self, FormChange, FormCx};
use crate::schema::{self, SchemaKind, SchemaVariant};
use crate::ui::{theme, widgets};
use crate::value::RowValue;

#[derive(Clone, Copy, PartialEq, Eq, VariantArray)]
enum QueryGroup {
    Character,
    Gear,
    Quests,
    Memories,
    Places,
    Actors,
    Ground,
    Skill,
}

impl QueryGroup {
    fn of(kind: RiftQueryKind) -> QueryGroup {
        match kind {
            RiftQueryKind::Level
            | RiftQueryKind::IsClass
            | RiftQueryKind::Stat
            | RiftQueryKind::HasStatus
            | RiftQueryKind::StatusCount
            | RiftQueryKind::StatusPower
            | RiftQueryKind::SkillRank
            | RiftQueryKind::SkillStat
            | RiftQueryKind::SpentSkillPoints => QueryGroup::Character,
            RiftQueryKind::Holding | RiftQueryKind::FreeSlots | RiftQueryKind::Wearing => {
                QueryGroup::Gear
            }
            RiftQueryKind::OnQuest
            | RiftQueryKind::QuestDone
            | RiftQueryKind::QuestCooling
            | RiftQueryKind::TaskDone
            | RiftQueryKind::QuestResetsIn => QueryGroup::Quests,
            RiftQueryKind::Memory | RiftQueryKind::SetWithin => QueryGroup::Memories,
            RiftQueryKind::Inside | RiftQueryKind::InArea | RiftQueryKind::KnowsArea => {
                QueryGroup::Places
            }
            RiftQueryKind::Nearest
            | RiftQueryKind::Count
            | RiftQueryKind::Distance
            | RiftQueryKind::Health
            | RiftQueryKind::Present
            | RiftQueryKind::IsNpc
            | RiftQueryKind::Walking
            | RiftQueryKind::Hostile
            | RiftQueryKind::Subject
            | RiftQueryKind::Target => QueryGroup::Actors,
            RiftQueryKind::GroundItems => QueryGroup::Ground,
            RiftQueryKind::SkillTargets | RiftQueryKind::SkillArea | RiftQueryKind::AimedPoint => {
                QueryGroup::Skill
            }
        }
    }

    fn title(self) -> &'static str {
        match self {
            QueryGroup::Character => "The character",
            QueryGroup::Gear => "Bag and gear",
            QueryGroup::Quests => "Quests",
            QueryGroup::Memories => "Memories",
            QueryGroup::Places => "Places",
            QueryGroup::Actors => "Actors",
            QueryGroup::Ground => "Ground",
            QueryGroup::Skill => "The skill",
        }
    }
}

fn sign(kind: ExprKind) -> Option<&'static str> {
    Some(match kind {
        ExprKind::Equal => "=",
        ExprKind::NotEqual => "≠",
        ExprKind::Less => "<",
        ExprKind::AtMost => "≤",
        ExprKind::More => ">",
        ExprKind::AtLeast => "≥",
        ExprKind::Add => "+",
        ExprKind::Subtract => "−",
        ExprKind::Multiply => "×",
        ExprKind::Divide => "÷",
        ExprKind::Min => "min",
        ExprKind::Max => "max",
        ExprKind::Local
        | ExprKind::State
        | ExprKind::Event
        | ExprKind::All
        | ExprKind::Any
        | ExprKind::Join
        | ExprKind::Not
        | ExprKind::Round
        | ExprKind::Bool
        | ExprKind::Int
        | ExprKind::Num
        | ExprKind::Text
        | ExprKind::Var
        | ExprKind::Query => return None,
    })
}

const KEPT: [ExprKind; 3] = [ExprKind::Local, ExprKind::State, ExprKind::Event];

fn is_kept(tag: &str) -> bool {
    tag.parse().is_ok_and(|kind| KEPT.contains(&kind))
}

/// What a block yields when its kind alone says; a kept value's or a memory's comes from where it
/// is kept.
fn yields(tag: &str) -> Option<ValueType> {
    if let Ok(query) = tag.parse::<RiftQueryKind>() {
        return query.value_type();
    }
    match tag.parse::<ExprKind>().ok()? {
        ExprKind::All
        | ExprKind::Any
        | ExprKind::Not
        | ExprKind::Equal
        | ExprKind::NotEqual
        | ExprKind::Less
        | ExprKind::AtMost
        | ExprKind::More
        | ExprKind::AtLeast
        | ExprKind::Bool => Some(ValueType::Boolean),
        ExprKind::Add
        | ExprKind::Subtract
        | ExprKind::Multiply
        | ExprKind::Divide
        | ExprKind::Min
        | ExprKind::Max
        | ExprKind::Num => Some(ValueType::Number),
        ExprKind::Round | ExprKind::Int => Some(ValueType::Integer),
        ExprKind::Join | ExprKind::Text => Some(ValueType::Text),
        ExprKind::Local | ExprKind::State | ExprKind::Event | ExprKind::Var | ExprKind::Query => {
            None
        }
    }
}

fn type_word(tag: &str) -> &'static str {
    match yields(tag) {
        Some(ValueType::Boolean) => "yes or no",
        Some(ValueType::Integer | ValueType::Number) => "number",
        Some(ValueType::Text) => "text",
        Some(ValueType::Actor) => "actor",
        Some(ValueType::Actors) => "actors",
        Some(ValueType::Point) => "point",
        Some(ValueType::Area) => "area",
        None => "its type",
    }
}

fn fits(slot: Slot, tag: &str) -> bool {
    slot == Slot::Any || matches!(yields(tag), None | Some(ValueType::Boolean))
}

fn title(tag: &str) -> String {
    match tag.parse() {
        Ok(ExprKind::All) => "all of".to_owned(),
        Ok(ExprKind::Any) => "any of".to_owned(),
        _ => tag.replace('_', " "),
    }
}

pub fn edit(
    ui: &mut Ui,
    cx: &mut FormCx,
    schema: &Value,
    value: &mut Value,
    path: &str,
) -> FormChange {
    let schema = schema::resolve(cx.root, schema);
    let alternatives: Vec<&Value> = match schema::kind(cx.root, schema) {
        SchemaKind::Choice(list) => list,
        SchemaKind::Union(variants) => variants.iter().map(|variant| variant.schema).collect(),
        _ => Vec::new(),
    };
    if alternatives.is_empty() {
        return forms::raw_json(ui, cx, value, path);
    }
    let mut variants: Vec<SchemaVariant> = Vec::new();
    let mut plain: Vec<&Value> = Vec::new();
    for alternative in &alternatives {
        match schema::tag_of(alternative) {
            Some((field, tag)) => variants.push(SchemaVariant {
                field,
                tag,
                schema: alternative,
            }),
            None => plain.push(alternative),
        }
    }
    let palette = Palette {
        variants: &variants,
        has_var: plain.iter().any(|alternative| {
            alternative
                .get("properties")
                .and_then(|p| p.get("var"))
                .is_some()
        }),
    };
    let mut changed = FormChange::default();
    ui.vertical(|ui| {
        ui.set_width(ui.available_width());
        ui.spacing_mut().item_spacing = egui::vec2(4.0, 4.0);
        ui.horizontal_wrapped(|ui| {
            changed = block(ui, cx, &palette, value, path, Slot::Any);
        });
        if let Value::Object(_) = value
            && schema::variant_of(&variants, value).is_none()
            && value.get("var").is_none()
            && !plain
                .iter()
                .any(|alternative| schema::fits(cx.root, alternative, value))
        {
            ui.colored_label(theme::DANGER, "unknown block");
            changed |= forms::raw_json(ui, cx, value, path);
        }
    });
    changed
}

struct Palette<'a> {
    variants: &'a [SchemaVariant<'a>],
    has_var: bool,
}

impl Palette<'_> {
    fn variant(&self, tag: &str) -> Option<&SchemaVariant<'_>> {
        self.variants.iter().find(|variant| variant.tag == tag)
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Slot {
    Any,
    YesOrNo,
}

fn block(
    ui: &mut Ui,
    cx: &mut FormCx,
    palette: &Palette,
    value: &mut Value,
    path: &str,
    slot: Slot,
) -> FormChange {
    let mut changed = FormChange::default();
    match value {
        Value::Bool(flag) => {
            let text = if *flag { "true" } else { "false" };
            let response = chip(ui, text, theme::INPUT, theme::TEXT);
            if response.clicked() {
                *value = Value::Bool(!*flag);
                changed = FormChange::at(path);
            }
            changed |=
                picker_popup(ui, cx, &response, palette, slot, value, path).unwrap_or_default();
        }
        Value::Number(_) => {
            ui.scope(|ui| {
                ui.set_width(56.0);
                let schema = serde_json::json!({ "type": "number" });
                let mut number = value.clone();
                if forms::value(ui, cx, &schema, &mut number, &format!("{path}~n")).is_some() {
                    *value = number;
                    changed = FormChange::at(path);
                }
            });
            let response = glyph::button(ui, Mark::CaretDown, 12.0, theme::FAINT, "Pick");
            changed |=
                picker_popup(ui, cx, &response, palette, slot, value, path).unwrap_or_default();
        }
        Value::String(_) => {
            ui.scope(|ui| {
                ui.set_width(120.0);
                let mut text = value.clone();
                if forms::text(ui, cx, &mut text, &format!("{path}~s")).is_some() {
                    *value = text;
                    changed = FormChange::at(path);
                }
            });
            let response = glyph::button(ui, Mark::CaretDown, 12.0, theme::FAINT, "Pick");
            changed |=
                picker_popup(ui, cx, &response, palette, slot, value, path).unwrap_or_default();
        }
        Value::Null => {
            let response = chip(ui, "+ pick…", theme::INPUT, theme::MUTED);
            changed |=
                picker_popup(ui, cx, &response, palette, slot, value, path).unwrap_or_default();
        }
        Value::Object(object) if object.len() == 1 && object.contains_key("var") => {
            let mut name = object["var"].clone();
            let mut renamed = false;
            ui.scope(|ui| {
                ui.set_width(100.0);
                if forms::text(ui, cx, &mut name, &format!("{path}/var")).is_some() {
                    renamed = true;
                }
            });
            if renamed {
                value["var"] = name.clone();
                changed = FormChange::at(path);
            }
            let response = chip(ui, "◇ variable", theme::INPUT, theme::VARIABLE);
            changed |=
                picker_popup(ui, cx, &response, palette, slot, value, path).unwrap_or_default();
        }
        Value::Object(_) => {
            let tag = value.kind().to_owned();
            match tag.parse::<ExprKind>() {
                Ok(ExprKind::All | ExprKind::Any) => {
                    changed = list_block(ui, cx, palette, value, path, &tag, slot)
                }
                Ok(kind @ (ExprKind::Not | ExprKind::Round)) => {
                    ui.horizontal_wrapped(|ui| {
                        let response = tag_chip(ui, &tag);
                        changed |= picker_popup(ui, cx, &response, palette, slot, value, path)
                            .unwrap_or_default();
                        if changed.0.is_none() {
                            let mut inner = value.get("of").cloned().unwrap_or(Value::Null);
                            let inner_slot = if kind == ExprKind::Not {
                                Slot::YesOrNo
                            } else {
                                Slot::Any
                            };
                            if block(
                                ui,
                                cx,
                                palette,
                                &mut inner,
                                &format!("{path}/of"),
                                inner_slot,
                            )
                            .is_some()
                            {
                                value["of"] = inner;
                                changed = FormChange::at(path);
                            }
                        }
                    });
                }
                Ok(kind) if let Some(shown) = sign(kind) => {
                    ui.horizontal_wrapped(|ui| {
                        let mut a = value.get("a").cloned().unwrap_or(Value::Null);
                        if block(ui, cx, palette, &mut a, &format!("{path}/a"), Slot::Any).is_some()
                        {
                            value["a"] = a;
                            changed = FormChange::at(path);
                        }
                        let response = dropdown_chip(ui, shown, theme::INPUT, theme::CODE);
                        egui::Popup::from_toggle_button_response(&response)
                            .id(ui.id().with(path).with("op"))
                            .show(|ui| {
                                for &op in ExprKind::VARIANTS {
                                    let Some(sign) = sign(op) else { continue };
                                    if ui
                                        .button(format!("{sign}  {}", schema::title(op.name())))
                                        .clicked()
                                    {
                                        value["type"] = Value::from(op.name());
                                        changed = FormChange::at(path);
                                        ui.close();
                                    }
                                }
                            });
                        let mut b = value.get("b").cloned().unwrap_or(Value::Null);
                        if block(ui, cx, palette, &mut b, &format!("{path}/b"), Slot::Any).is_some()
                        {
                            value["b"] = b;
                            changed = FormChange::at(path);
                        }
                    });
                }
                Ok(kind) if KEPT.contains(&kind) => {
                    ui.horizontal_wrapped(|ui| {
                        let response = tag_chip(ui, &tag);
                        changed |= picker_popup(ui, cx, &response, palette, slot, value, path)
                            .unwrap_or_default();
                        if changed.0.is_none() {
                            let mut name = value
                                .get(&tag)
                                .cloned()
                                .unwrap_or(Value::String(String::new()));
                            ui.scope(|ui| {
                                ui.set_width(120.0);
                                if forms::text(ui, cx, &mut name, &format!("{path}/{tag}"))
                                    .is_some()
                                {
                                    value[&tag] = name;
                                    changed = FormChange::at(path);
                                }
                            });
                        }
                    });
                }
                _ => changed = query_block(ui, cx, palette, value, path, &tag, slot),
            }
        }
        Value::Array(_) => {
            changed = forms::raw_json(ui, cx, value, path);
        }
    }
    changed
}

fn list_block(
    ui: &mut Ui,
    cx: &mut FormCx,
    palette: &Palette,
    value: &mut Value,
    path: &str,
    tag: &str,
    slot: Slot,
) -> FormChange {
    let mut changed = FormChange::default();
    let response = tag_chip(ui, tag);
    if let Some(picked) = picker_popup(ui, cx, &response, palette, slot, value, path) {
        return picked;
    }
    let mut items = value
        .get("of")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut remove = None;
    let mut added: Option<Value> = None;
    ui.horizontal_top(|ui| {
        ui.add_space(6.0);
        let guide_x = ui.cursor().min.x;
        let top = ui.cursor().min.y;
        ui.add_space(8.0);
        let bottom = ui
            .vertical(|ui| {
                for (index, item) in items.iter_mut().enumerate() {
                    let row = ui.horizontal_top(|ui| {
                        if block(
                            ui,
                            cx,
                            palette,
                            item,
                            &format!("{path}/of/{index}"),
                            Slot::YesOrNo,
                        )
                        .is_some()
                        {
                            changed = FormChange::at(path);
                        }
                    });
                    let hovered =
                        row.response.hovered() || ui.rect_contains_pointer(row.response.rect);
                    if hovered {
                        let at = egui::pos2(
                            row.response.rect.right() + 8.0,
                            row.response.rect.center().y,
                        );
                        let hit = egui::Rect::from_center_size(at, egui::vec2(14.0, 14.0));
                        let cross = ui.interact(
                            hit,
                            ui.id().with(path).with(("remove", index)),
                            egui::Sense::click(),
                        );
                        Mark::Cross.paint(
                            ui.painter(),
                            egui::Rect::from_center_size(at, egui::vec2(9.0, 9.0)),
                            theme::FAINT,
                        );
                        if cross.clicked() {
                            remove = Some(index);
                        }
                    }
                }
                let add = dropdown_chip(ui, "+ condition", theme::INPUT, theme::TEXT);
                let id = ui.id().with(path).with("add");
                egui::Popup::from_toggle_button_response(&add)
                    .id(id)
                    .width(300.0)
                    .show(|ui| {
                        if let Some(fresh) = picker_body(ui, cx, palette, Slot::YesOrNo) {
                            added = Some(fresh);
                            ui.close();
                        }
                    });
                ui.cursor().min.y
            })
            .inner;
        ui.painter().line_segment(
            [
                egui::pos2(guide_x, top + 2.0),
                egui::pos2(guide_x, bottom - 4.0),
            ],
            Stroke::new(1.0, theme::BORDER),
        );
    });
    if let Some(index) = remove {
        items.remove(index);
        changed = FormChange::at(path);
    }
    if let Some(fresh) = added {
        items.push(fresh);
        changed = FormChange::at(path);
    }
    if changed.is_some() {
        value["of"] = Value::Array(items);
    }
    changed
}

fn query_block(
    ui: &mut Ui,
    cx: &mut FormCx,
    palette: &Palette,
    value: &mut Value,
    path: &str,
    tag: &str,
    slot: Slot,
) -> FormChange {
    let mut changed = FormChange::default();
    let Some(variant) = palette.variant(tag) else {
        let response = chip(ui, tag, theme::INPUT, theme::DANGER);
        return picker_popup(ui, cx, &response, palette, slot, value, path).unwrap_or(changed);
    };
    let schema = variant.schema;
    let fields: Vec<(String, Value)> = schema::properties(schema)
        .into_iter()
        .filter(|(name, _)| *name != "type")
        .map(|(name, field)| (name.clone(), field.clone()))
        .collect();
    let required = schema::required(schema);
    ui.horizontal_wrapped(|ui| {
        let response = tag_chip(ui, tag);
        if let Some(picked) = picker_popup(ui, cx, &response, palette, slot, value, path) {
            changed = picked;
            return;
        }
        for (name, field) in &fields {
            let field_path = format!("{path}/{name}");
            let resolved = schema::resolve(cx.root, field);
            let optional = !required.contains(&name.as_str()) || schema::is_optional(field);
            let present = value.get(name).is_some_and(|v| !v.is_null());
            if !present {
                if optional {
                    continue;
                }
                let fresh = schema::template(cx.root, field, cx.nearby());
                value[name] = fresh;
            }
            let child = value.get_mut(name).expect("set above");
            if schema::marker(resolved) == Some("x-condition") {
                ui.label(theme::muted(name).size(12.0));
                if block(ui, cx, palette, child, &field_path, Slot::Any).is_some() {
                    changed = FormChange::at(path);
                }
                continue;
            }
            if schema::table_of(schema::non_null(cx.root, field)).is_none() {
                ui.label(theme::muted(name).size(12.0));
            }
            ui.scope(|ui| {
                ui.set_max_width(170.0);
                if forms::value(ui, cx, field, child, &field_path).is_some() {
                    changed = FormChange::at(path);
                }
            });
        }
    });
    changed
}

fn tag_chip(ui: &mut Ui, tag: &str) -> egui::Response {
    let response = chip(ui, &title(tag), theme::RAISED, theme::TEXT);
    ui.label(
        RichText::new(type_word(tag).to_uppercase())
            .size(10.0)
            .color(theme::FAINT),
    );
    response
}

fn chip(ui: &mut Ui, text: &str, fill: Color32, ink: Color32) -> egui::Response {
    framed_chip(ui, text, fill, ink, false)
}

/// A chip that opens a list to choose from, its caret on the right.
fn dropdown_chip(ui: &mut Ui, text: &str, fill: Color32, ink: Color32) -> egui::Response {
    framed_chip(ui, text, fill, ink, true)
}

fn framed_chip(
    ui: &mut Ui,
    text: &str,
    fill: Color32,
    ink: Color32,
    caret: bool,
) -> egui::Response {
    egui::Frame::new()
        .fill(fill)
        .stroke(Stroke::new(1.0, theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(7, 2))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 4.0;
                ui.label(RichText::new(text).monospace().size(12.5).color(ink));
                if caret {
                    ui.label(Mark::CaretDown.text(10.0).color(ink));
                }
            });
        })
        .response
        .interact(egui::Sense::click())
        .on_hover_cursor(egui::CursorIcon::PointingHand)
}

fn picker_popup(
    ui: &mut Ui,
    cx: &mut FormCx,
    response: &egui::Response,
    palette: &Palette,
    slot: Slot,
    value: &mut Value,
    path: &str,
) -> Option<FormChange> {
    let id = ui.id().with(path).with("picker");
    let mut changed = None;
    egui::Popup::from_toggle_button_response(response)
        .id(id)
        .width(300.0)
        .show(|ui| {
            if let Some(fresh) = picker_body(ui, cx, palette, slot) {
                *value = fresh;
                changed = Some(FormChange::at(path));
                ui.close();
            }
        });
    changed
}

fn picker_body(ui: &mut Ui, cx: &mut FormCx, palette: &Palette, slot: Slot) -> Option<Value> {
    let mut picked: Option<Value> = None;
    ui.set_width(300.0);
    egui::ScrollArea::vertical()
        .max_height(420.0)
        .show(ui, |ui| {
            for &group in QueryGroup::VARIANTS {
                let members: Vec<&SchemaVariant> = palette
                    .variants
                    .iter()
                    .filter(|variant| {
                        variant
                            .tag
                            .parse()
                            .is_ok_and(|kind| QueryGroup::of(kind) == group)
                            && fits(slot, &variant.tag)
                    })
                    .collect();
                if members.is_empty() {
                    continue;
                }
                widgets::section(ui, group.title());
                for variant in members {
                    if entry(ui, &variant.tag) {
                        picked = Some(schema::variant_template(cx.root, variant, cx.nearby()));
                    }
                }
            }
            widgets::section(ui, "Kept values");
            ui.horizontal_wrapped(|ui| {
                for kind in KEPT {
                    if let Some(variant) = palette.variant(kind.name())
                        && chip(ui, kind.name(), theme::INPUT, theme::TEXT).clicked()
                    {
                        picked = Some(schema::variant_template(cx.root, variant, cx.nearby()));
                    }
                }
                if palette.has_var
                    && chip(ui, "◇ variable", theme::INPUT, theme::VARIABLE).clicked()
                {
                    picked = Some(serde_json::json!({ "var": "" }));
                }
            });
            ui.add_space(6.0);
            ui.separator();
            ui.horizontal_wrapped(|ui| {
                for kind in [ExprKind::All, ExprKind::Any, ExprKind::Not] {
                    if let Some(variant) = palette.variant(kind.name())
                        && chip(ui, &title(kind.name()), theme::INPUT, theme::TEXT).clicked()
                    {
                        picked = Some(schema::variant_template(cx.root, variant, cx.nearby()));
                    }
                }
                if let Some(variant) = palette.variant(ExprKind::Equal.name())
                    && chip(ui, "compare", theme::INPUT, theme::TEXT).clicked()
                {
                    let mut fresh = schema::variant_template(cx.root, variant, cx.nearby());
                    fresh["a"] = Value::from(0);
                    fresh["b"] = Value::from(0);
                    picked = Some(fresh);
                }
                if slot == Slot::Any {
                    if let Some(variant) = palette.variant(ExprKind::Add.name())
                        && chip(ui, "arithmetic", theme::INPUT, theme::TEXT).clicked()
                    {
                        let mut fresh = schema::variant_template(cx.root, variant, cx.nearby());
                        fresh["a"] = Value::from(0);
                        fresh["b"] = Value::from(0);
                        picked = Some(fresh);
                    }
                    for (label, constant) in [
                        ("true", Value::Bool(true)),
                        ("0", Value::from(0)),
                        ("text", Value::String(String::new())),
                    ] {
                        if chip(ui, label, theme::INPUT, theme::MUTED).clicked() {
                            picked = Some(constant);
                        }
                    }
                } else if chip(ui, "true", theme::INPUT, theme::MUTED).clicked() {
                    picked = Some(Value::Bool(true));
                }
            });
        });
    picked
}

fn entry(ui: &mut Ui, tag: &str) -> bool {
    let response = ui
        .horizontal(|ui| {
            ui.label(
                RichText::new(tag.replace('_', " "))
                    .size(13.0)
                    .color(theme::TEXT),
            );
            ui.label(theme::muted(type_word(tag)).size(11.5));
        })
        .response
        .interact(egui::Sense::click());
    if response.hovered() {
        ui.painter().rect_filled(
            response.rect.expand2(egui::vec2(6.0, 1.0)),
            3.0,
            theme::ACCENT_SOFT,
        );
    }
    response
        .on_hover_cursor(egui::CursorIcon::PointingHand)
        .clicked()
}

pub fn describe(value: &Value) -> String {
    match value {
        Value::Bool(flag) => flag.to_string(),
        Value::Number(number) => number.to_string(),
        Value::String(text) => format!("{text:?}"),
        Value::Null => "nothing".to_owned(),
        Value::Object(object) => {
            if let Some(name) = object.get("var").and_then(Value::as_str) {
                return format!("variable {name}");
            }
            match object.get("type").and_then(Value::as_str) {
                Some(tag) if is_kept(tag) => format!("{tag} {}", object.text(tag)),
                Some(tag) => schema::title(tag),
                None => "block".to_owned(),
            }
        }
        Value::Array(_) => "list".to_owned(),
    }
}

pub fn summary(value: &Value) -> String {
    fn go(value: &Value, out: &mut String, depth: usize) {
        if depth > 4 {
            out.push('…');
            return;
        }
        match value {
            Value::Object(object) if object.get("var").is_some() && object.len() == 1 => {
                out.push_str(&format!("◇{}", object.text("var")));
            }
            Value::Object(object) => {
                let tag = object.get("type").and_then(Value::as_str).unwrap_or("");
                match tag.parse::<ExprKind>() {
                    Ok(ExprKind::All) => joined(&object["of"], " and ", out, depth),
                    Ok(ExprKind::Any) => joined(&object["of"], " or ", out, depth),
                    Ok(ExprKind::Join) => joined(&object["of"], " + ", out, depth),
                    Ok(ExprKind::Not) => {
                        out.push_str("not ");
                        go(&object["of"], out, depth + 1);
                    }
                    Ok(kind) if let Some(shown) = sign(kind) => {
                        go(&object["a"], out, depth + 1);
                        out.push_str(&format!(" {shown} "));
                        go(&object["b"], out, depth + 1);
                    }
                    Ok(kind) if KEPT.contains(&kind) => {
                        out.push_str(object[tag].as_str().unwrap_or(""));
                    }
                    _ => {
                        out.push_str(tag);
                        let named: Vec<String> = object
                            .iter()
                            .filter(|(key, _)| *key != "type" && *key != "of")
                            .filter_map(|(_, v)| v.as_str().map(str::to_owned))
                            .collect();
                        if !named.is_empty() {
                            out.push(' ');
                            out.push_str(&named.join(" "));
                        }
                    }
                }
            }
            other => out.push_str(&describe(other)),
        }
    }
    fn joined(list: &Value, word: &str, out: &mut String, depth: usize) {
        out.push('(');
        for (index, item) in list.as_array().into_iter().flatten().enumerate() {
            if index > 0 {
                out.push_str(word);
            }
            go(item, out, depth + 1);
        }
        out.push(')');
    }
    let mut out = String::new();
    go(value, &mut out, 0);
    out
}
