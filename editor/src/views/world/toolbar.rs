use egui::{Align, Layout as EguiLayout, RichText, Ui, Vec2};

use super::atlas::Atlas;
use super::{ColourBy, ColourOf, ColourShow, Layout, Lens};
use crate::app::Editor;
use crate::ui::{theme, widgets};

const SEARCH_WIDTH: f32 = 300.0;

pub fn show(editor: &mut Editor, ui: &mut Ui, atlas: &Atlas, layout: &Layout) {
    let mut pick: Option<Pick> = None;
    let mut remove: Option<Chip> = None;
    egui::Frame::new()
        .inner_margin(egui::Margin::symmetric(8, 6))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 8.0;
                let search = search_box(editor, ui, &mut remove);
                if !editor.views.world.search.trim().is_empty() {
                    pick = results(editor, ui, atlas, &search);
                }
                ui.menu_button(RichText::new("Layers ▾").size(12.5), |ui| {
                    ui.set_width(220.0);
                    layers_menu(editor, ui, atlas, layout);
                });
                ui.menu_button(RichText::new("Colour by ▾").size(12.5), |ui| {
                    ui.set_width(260.0);
                    if let Some(colour) = colour_menu(editor, ui) {
                        pick = Some(Pick::Colour(colour));
                        ui.close();
                    }
                });
                if ui.button(RichText::new("Arrange…").size(12.5)).clicked() {
                    super::arrange::open(editor);
                }
                if ui.button(RichText::new("Fit").size(12.5)).clicked() {
                    editor.views.world.fitted = false;
                }
                ui.label(
                    theme::faint(format!("zoom {:.0}%", editor.views.world.zoom * 100.0))
                        .monospace()
                        .size(12.0),
                );
            });
        });
    if let Some(chip) = remove {
        let view = &mut editor.views.world;
        match chip {
            Chip::Lens(index) => {
                view.lenses.remove(index);
            }
            Chip::Colour => view.colour = None,
            Chip::Line => view.quest_line = None,
            Chip::Route => view.route = None,
        }
    }
    if let Some(pick) = pick {
        apply(editor, atlas, layout, pick);
    }
}

enum Chip {
    Lens(usize),
    Colour,
    Line,
    Route,
}

#[derive(Clone)]
pub enum Pick {
    Area(String),
    Lens(Lens),
    Line(String),
    Colour(ColourBy),
}

fn search_box(editor: &mut Editor, ui: &mut Ui, remove: &mut Option<Chip>) -> egui::Response {
    let mut inner = None;
    egui::Frame::new()
        .fill(theme::INPUT)
        .stroke(egui::Stroke::new(1.0, theme::BORDER))
        .corner_radius(4.0)
        .inner_margin(egui::Margin::symmetric(8, 3))
        .show(ui, |ui| {
            ui.set_min_width(SEARCH_WIDTH);
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 6.0;
                ui.label(theme::muted("🔍"));
                let view = &mut editor.views.world;
                for (index, lens) in view.lenses.iter().enumerate() {
                    let (_, closed) = widgets::chip_closable(ui, &lens.chip());
                    if closed {
                        *remove = Some(Chip::Lens(index));
                    }
                }
                if let Some(colour) = &view.colour {
                    let (_, closed) = widgets::chip_closable(ui, &colour.chip());
                    if closed {
                        *remove = Some(Chip::Colour);
                    }
                }
                if let Some(line) = &view.quest_line {
                    let (_, closed) = widgets::chip_closable(ui, &format!("quest line: {line}"));
                    if closed {
                        *remove = Some(Chip::Line);
                    }
                }
                if let Some((from, to)) = &view.route {
                    let (_, closed) = widgets::chip_closable(ui, &format!("route: {from} → {to}"));
                    if closed {
                        *remove = Some(Chip::Route);
                    }
                }
                let empty = view.lenses.is_empty()
                    && view.colour.is_none()
                    && view.quest_line.is_none()
                    && view.route.is_none();
                let hint = if empty {
                    "Search areas, npcs, items, quests…"
                } else {
                    ""
                };
                let response = ui.add(
                    egui::TextEdit::singleline(&mut view.search)
                        .frame(egui::Frame::NONE)
                        .hint_text(hint)
                        .desired_width(if empty { SEARCH_WIDTH - 30.0 } else { 120.0 })
                        .font(egui::TextStyle::Body),
                );
                inner = Some(response);
            });
        });
    inner.expect("search box")
}

/// The dropdown under the search box: what the text matches, grouped by kind. Enter takes the first.
fn results(
    editor: &mut Editor,
    ui: &mut Ui,
    atlas: &Atlas,
    search: &egui::Response,
) -> Option<Pick> {
    let text = editor.views.world.search.trim().to_lowercase();
    let files = &editor.project.as_ref()?.files;
    let mut rows: Vec<(&'static str, String, Pick)> = Vec::new();
    for key in atlas.areas.keys().filter(|key| key.contains(&text)).take(6) {
        rows.push(("area", key.clone(), Pick::Area(key.clone())));
    }
    for table in ["npc", "item", "quest", "shop"] {
        for file in files.paths_under(&format!("tables/{table}/")) {
            let Some((_, key)) = crate::project::row_of(file) else {
                continue;
            };
            if key.contains(&text) {
                rows.push((
                    table,
                    key.to_owned(),
                    Pick::Lens(Lens::Row {
                        table: table.to_owned(),
                        key: key.to_owned(),
                    }),
                ));
            }
        }
    }
    for line in &atlas.lines {
        if line.category.to_lowercase().contains(&text) {
            rows.push((
                "quest line",
                format!("{} · {} quests", line.category, line.quests.len()),
                Pick::Line(line.category.clone()),
            ));
        }
    }
    for module in atlas
        .module_types
        .iter()
        .filter(|module| module.contains(&text))
        .take(6)
    {
        rows.push((
            "module",
            module.clone(),
            Pick::Lens(Lens::Module(module.clone())),
        ));
    }
    rows.push((
        "text",
        format!("“{text}” anywhere in an area",),
        Pick::Lens(Lens::Text(text.clone())),
    ));
    let mut picked: Option<Pick> = None;
    let enter = search.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
    if enter {
        picked = rows.first().map(|(_, _, pick)| pick.clone());
    }
    let anchor = search.rect.left_bottom() + Vec2::new(-8.0, 8.0);
    egui::Area::new(ui.id().with("world-search-results"))
        .fixed_pos(anchor)
        .order(egui::Order::Foreground)
        .show(ui.ctx(), |ui| {
            egui::Frame::popup(ui.style())
                .fill(theme::RAISED)
                .show(ui, |ui| {
                    ui.set_width(SEARCH_WIDTH + 40.0);
                    let mut last_kind = "";
                    for (kind, label, pick) in rows.iter().take(24) {
                        if *kind != last_kind {
                            widgets::section(ui, kind);
                            last_kind = kind;
                        }
                        let response = ui.add(
                            egui::Button::new(theme::mono(label).size(12.5))
                                .frame(false)
                                .min_size(Vec2::new(ui.available_width(), 20.0)),
                        );
                        if response.clicked() {
                            picked = Some(pick.clone());
                        }
                    }
                    ui.add_space(4.0);
                    ui.label(theme::faint("Enter takes the first · Esc clears").size(11.0));
                });
        });
    if ui.input(|i| i.key_pressed(egui::Key::Escape)) {
        editor.views.world.search.clear();
    }
    picked
}

fn apply(editor: &mut Editor, atlas: &Atlas, layout: &Layout, pick: Pick) {
    editor.views.world.search.clear();
    match pick {
        Pick::Area(key) => {
            super::select(editor, vec![super::Part::Card(key.clone())]);
            let zoom = editor.views.world.zoom;
            editor.views.world.look_at(atlas, layout, &key, zoom);
        }
        Pick::Lens(lens) => {
            if !editor.views.world.lenses.contains(&lens) {
                editor.views.world.lenses.push(lens);
            }
        }
        Pick::Line(category) => editor.views.world.quest_line = Some(category),
        Pick::Colour(colour) => editor.views.world.colour = Some(colour),
    }
}

fn layers_menu(editor: &mut Editor, ui: &mut Ui, atlas: &Atlas, layout: &Layout) {
    let counts = LayerCounts::of(atlas, layout);
    let layers = &mut editor.views.world.layers;
    for (on, label, count) in [
        (&mut layers.warps, "warps", counts.warps),
        (&mut layers.residents, "residents", counts.residents),
        (&mut layers.populations, "populations", counts.populations),
        (&mut layers.givers, "quest givers", counts.givers),
        (&mut layers.regions, "regions and notes", counts.regions),
    ] {
        ui.horizontal(|ui| {
            widgets::toggle(ui, on);
            ui.label(RichText::new(label).size(13.0));
            ui.with_layout(EguiLayout::right_to_left(Align::Center), |ui| {
                ui.label(theme::faint(count.to_string()).monospace().size(12.0));
            });
        });
    }
}

pub struct LayerCounts {
    pub warps: usize,
    pub residents: usize,
    pub populations: usize,
    pub givers: usize,
    pub regions: usize,
}

impl LayerCounts {
    pub fn of(atlas: &Atlas, layout: &Layout) -> LayerCounts {
        LayerCounts {
            warps: atlas.warps.len(),
            residents: atlas.areas.values().map(|info| info.residents.len()).sum(),
            populations: atlas
                .areas
                .values()
                .map(|info| info.populations.len())
                .sum(),
            givers: atlas
                .areas
                .keys()
                .map(|area| atlas.givers(area).len())
                .sum(),
            regions: layout.regions.len() + layout.notes.len(),
        }
    }
}

/// Every number field of the tables placed in areas, read from the row schemas.
pub fn number_fields(editor: &Editor) -> Vec<String> {
    let mut out = Vec::new();
    for table in ["npc", "item", "quest", "shop", "area"] {
        let Some(shape) = editor.shapes.table(table) else {
            continue;
        };
        let root = &shape.shape;
        walk(root, root, &mut vec![table.to_owned()], &mut out, 0);
    }
    out.sort();
    out.dedup();
    out
}

fn walk(
    root: &serde_json::Value,
    schema: &serde_json::Value,
    path: &mut Vec<String>,
    out: &mut Vec<String>,
    depth: usize,
) {
    if depth > 5 {
        return;
    }
    let schema = crate::schema::resolve(root, schema);
    let types = crate::schema::type_names(schema);
    if types.iter().any(|t| *t == "number" || *t == "integer") {
        out.push(path.join("."));
        return;
    }
    if let Some(items) = schema.get("items") {
        walk(root, items, path, out, depth + 1);
    }
    for (name, field) in crate::schema::properties(schema) {
        if name == "modules" || name == "type" {
            continue;
        }
        path.push(name.clone());
        walk(root, field, path, out, depth + 1);
        path.pop();
    }
    for variant in ["oneOf", "anyOf"]
        .iter()
        .filter_map(|key| schema.get(*key))
        .filter_map(|v| v.as_array())
        .flatten()
    {
        let variant = crate::schema::resolve(root, variant);
        match crate::schema::tag_of(variant) {
            Some((_, tag)) => {
                path.push(tag);
                walk(root, variant, path, out, depth + 1);
                path.pop();
            }
            None => walk(root, variant, path, out, depth + 1),
        }
    }
    if let Some(modules) = schema.get("properties").and_then(|p| p.get("modules")) {
        walk(root, modules, path, out, depth + 1);
    }
}

fn colour_menu(editor: &mut Editor, ui: &mut Ui) -> Option<ColourBy> {
    let fields = number_fields(editor);
    let mut picked = None;
    if ui
        .add(egui::Button::new(RichText::new("none").size(13.0)).frame(false))
        .clicked()
    {
        editor.views.world.colour = None;
        ui.close();
    }
    egui::ScrollArea::vertical()
        .max_height(360.0)
        .show(ui, |ui| {
            let mut last_table = "";
            for field in &fields {
                let (table, rest) = field.split_once('.').unwrap_or((field, ""));
                if table != last_table {
                    widgets::section(ui, table);
                    last_table = table;
                }
                let on = editor
                    .views
                    .world
                    .colour
                    .as_ref()
                    .is_some_and(|c| &c.value == field);
                if ui
                    .add(
                        egui::Button::new(theme::mono(rest).size(12.5))
                            .frame(false)
                            .selected(on),
                    )
                    .clicked()
                {
                    picked = Some(ColourBy {
                        value: field.clone(),
                        of: if table == "npc" {
                            ColourOf::Hostile
                        } else {
                            ColourOf::Placed
                        },
                        show: ColourShow::Highest,
                    });
                }
            }
        });
    picked
}
