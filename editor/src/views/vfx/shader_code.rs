use std::collections::BTreeSet;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::LazyLock;

use egui::{Stroke, Ui};
use egui_code_editor::{CodeEditor, ColorTheme, Syntax};
use engine::core::content::ErrorPlace;
use engine::core::vfx::{ShaderError, VfxShaderDef, prelude_names};

use crate::ui::theme;

/// The code of a shader as the designer types it: WGSL highlighted, each line numbered, and the
/// first thing naga refuses marked on its line. Returns the draft shown and its verdict.
pub fn show(
    ui: &mut Ui,
    id: egui::Id,
    draft: &mut String,
    def: &VfxShaderDef,
    height: f32,
) -> (egui::Response, Result<(), ShaderError>) {
    let verdict = verdict(ui, id, def, draft);
    let pane = ui.available_rect_before_wrap();
    let pane = egui::Rect::from_min_size(pane.min, egui::vec2(pane.width(), height.max(0.0)));
    let (output, _) = ui
        .scope_builder(egui::UiBuilder::new().max_rect(pane), |ui| {
            CodeEditor::default()
                .id_source(format!("{id:?}"))
                .with_rows(MIN_ROWS)
                .with_fontsize(FONT_SIZE)
                .with_theme(THEME)
                .with_numlines(true)
                .with_clickable_links(false)
                .vscroll(true)
                .show(ui, draft, &WGSL)
        })
        .inner;
    if let Err(ShaderError {
        place: ErrorPlace::Text { line, .. },
        message,
    }) = &verdict
        && let Some(row) = output.galley.rows.get(line.saturating_sub(1))
    {
        let text = row.rect().translate(output.galley_pos.to_vec2());
        let marked = egui::Rect::from_min_max(
            egui::pos2(output.text_clip_rect.min.x, text.min.y),
            egui::pos2(output.text_clip_rect.max.x, text.max.y),
        );
        let painter = ui.painter();
        painter.rect_filled(marked, 0.0, theme::alpha(theme::BLOCKED, 40));
        painter.line_segment(
            [marked.left_bottom(), marked.right_bottom()],
            Stroke::new(1.5, theme::BLOCKED),
        );
        if ui.rect_contains_pointer(marked) {
            egui::Tooltip::always_open(
                ui.ctx().clone(),
                ui.layer_id(),
                id.with("shader-error"),
                egui::PopupAnchor::ParentRect(marked),
            )
            .show(|ui| {
                ui.label(theme::warn(message.as_str()));
            });
        }
    }
    (output.response.response, verdict)
}

// naga takes milliseconds on a shader, too long for every frame, so the draft's verdict is kept
// until the draft or its parameters change.
fn verdict(ui: &Ui, id: egui::Id, def: &VfxShaderDef, draft: &str) -> Result<(), ShaderError> {
    let mut hasher = DefaultHasher::new();
    draft.hash(&mut hasher);
    for param in &def.params {
        param.name.hash(&mut hasher);
        param.kind.label().hash(&mut hasher);
    }
    let key = hasher.finish();
    let slot = id.with("verdict");
    let kept: Option<(u64, Result<(), ShaderError>)> = ui.ctx().data(|data| data.get_temp(slot));
    if let Some((kept_key, verdict)) = kept
        && kept_key == key
    {
        return verdict;
    }
    let verdict = def.check_source(draft).map(|_| ());
    ui.ctx()
        .data_mut(|data| data.insert_temp(slot, (key, verdict.clone())));
    verdict
}

const FONT_SIZE: f32 = 12.5;
const MIN_ROWS: usize = 12;

const THEME: ColorTheme = ColorTheme {
    name: "rift",
    dark: false,
    bg: "e8dcbe",
    cursor: "2a1f15",
    selection: "e0cc99",
    comments: "8e7b60",
    functions: "2d4e8c",
    keywords: "6b3a7a",
    literals: "7a5212",
    numerics: "7a5212",
    punctuation: "5e4a33",
    strs: "2e6245",
    types: "2d4e8c",
    special: "8e1f14",
};

static WGSL: LazyLock<Syntax> = LazyLock::new(|| {
    let vocabulary: BTreeSet<&'static str> = prelude_names()
        .into_iter()
        .map(|name| &*name.leak())
        .chain(BUILTINS)
        .collect();
    Syntax::new("wgsl")
        .with_comment("//")
        .with_comment_multiline(["/*", "*/"])
        .with_keywords(KEYWORDS)
        .with_types(TYPES)
        .with_special(vocabulary)
});

const KEYWORDS: [&str; 32] = [
    "fn",
    "let",
    "var",
    "const",
    "override",
    "return",
    "if",
    "else",
    "for",
    "while",
    "loop",
    "break",
    "continue",
    "continuing",
    "switch",
    "case",
    "default",
    "struct",
    "discard",
    "true",
    "false",
    "alias",
    "enable",
    "@fragment",
    "@vertex",
    "@location",
    "@builtin",
    "@group",
    "@binding",
    "uniform",
    "requires",
    "diagnostic",
];

const TYPES: [&str; 16] = [
    "f32",
    "f16",
    "i32",
    "u32",
    "bool",
    "vec2",
    "vec3",
    "vec4",
    "mat2x2",
    "mat3x3",
    "mat4x4",
    "array",
    "texture_2d",
    "sampler",
    "ptr",
    "atomic",
];

/// The WGSL built-in functions a vfx shader reaches for.
const BUILTINS: [&str; 45] = [
    "textureSample",
    "abs",
    "sign",
    "floor",
    "ceil",
    "round",
    "fract",
    "min",
    "max",
    "clamp",
    "saturate",
    "mix",
    "step",
    "smoothstep",
    "select",
    "length",
    "distance",
    "normalize",
    "dot",
    "cross",
    "pow",
    "exp",
    "exp2",
    "log",
    "log2",
    "sqrt",
    "inverseSqrt",
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "atan2",
    "radians",
    "degrees",
    "all",
    "any",
    "modf",
    "trunc",
    "reflect",
    "faceForward",
    "fma",
    "textureDimensions",
    "arrayLength",
];
