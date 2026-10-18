use std::ops::Range;
use std::sync::Arc;

use bevy::prelude::World;
use design_tokens::{Face, TextRole};
use egui::emath::TSTransform;
use egui::epaint::TextShape;
use egui::text::{LayoutJob, TextFormat};
use egui::{
    Color32, FontId, Galley, Pos2, Rect, Response, Sense, Shape, Stroke, StrokeKind, Ui, Vec2,
    WidgetInfo, WidgetType,
};

use super::{KeyNames, StyledLine, TextMotion, TextPiece, TextVoice};

const WHISPER_SCALE: f32 = 0.9;
const WHISPER_ALPHA: f32 = 0.7;
const SHOUT_SCALE: f32 = 1.3;
const CAP_SCALE: f32 = 0.85;
const CAP_PAD_EM: f32 = 0.3;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TextLook {
    pub size: f32,
    pub color: Color32,
    pub hand: Hand,
    pub line_height: Option<f32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Hand {
    Book,
    Quill,
}

impl TextLook {
    pub const fn new(size: f32, color: Color32) -> TextLook {
        TextLook {
            size,
            color,
            hand: Hand::Book,
            line_height: None,
        }
    }

    pub fn role(role: TextRole, color: Color32) -> TextLook {
        TextLook {
            line_height: role.line_height(),
            ..TextLook::new(role.size(), color)
        }
    }

    pub const fn quill(self) -> TextLook {
        TextLook {
            hand: Hand::Quill,
            ..self
        }
    }
}

/// The line is laid out whole, so revealing letters never reflows it.
pub fn show(
    ui: &mut Ui,
    world: &World,
    line: &StyledLine,
    look: TextLook,
    shown: Option<usize>,
) -> Response {
    let keys = world.resource::<KeyNames>();
    let plan = Plan::new(line, keys, look);
    let galley = ui.painter().layout_job(plan.job(ui.available_width()));
    let pad = plan.pad;
    let (rect, response) = ui.allocate_exact_size(plan.footprint(&galley), Sense::hover());
    let plain = line.plain(keys);
    response.widget_info(|| WidgetInfo::labeled(WidgetType::Label, true, &plain));
    if !ui.is_rect_visible(rect) {
        return response;
    }
    let origin = rect.min - galley.rect.min.to_vec2();
    let placed = place(&galley, &plan, origin);
    let shown = shown.unwrap_or(plan.units);
    let time = ui.input(|input| input.time) as f32;
    for cap in plan.caps.iter().filter(|cap| cap.letter < shown) {
        paint_cap(ui, &placed, cap, pad);
    }
    for (index, word) in plan.words.iter().enumerate() {
        let visible = word.letters.start
            ..word
                .letters
                .clone()
                .take_while(|at| plan.letters[*at].letter < shown)
                .last()
                .map_or(word.letters.start, |last| last + 1);
        if visible.is_empty() {
            continue;
        }
        let Some(at) = placed[word.letters.start] else {
            continue;
        };
        paint_word(ui, &plan, visible, at, word.motion, index as f32, time);
    }
    response
}

pub fn measure(
    gui: &egui::Context,
    world: &World,
    line: &StyledLine,
    look: TextLook,
    wrap: f32,
) -> Vec2 {
    let plan = Plan::new(line, world.resource::<KeyNames>(), look);
    let galley = gui.fonts_mut(|fonts| fonts.layout_job(plan.job(wrap)));
    plan.footprint(&galley)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TextShadow {
    pub offset: Vec2,
    pub color: Color32,
}

/// `shift` moves and scales the drawing about the text's centre while the space it takes stays put,
/// so a moving title never reflows what is around it.
pub fn show_shadowed(
    ui: &mut Ui,
    text: &str,
    font: FontId,
    color: Color32,
    shadow: TextShadow,
    shift: TSTransform,
) -> Response {
    let galley = ui.painter().layout_no_wrap(text.to_owned(), font, color);
    let (rect, response) = ui.allocate_exact_size(galley.size(), Sense::hover());
    response.widget_info(|| WidgetInfo::labeled(WidgetType::Label, true, text));
    if !ui.is_rect_visible(rect) {
        return response;
    }
    let centre = rect.center().to_vec2();
    let around =
        TSTransform::from_translation(centre) * shift * TSTransform::from_translation(-centre);
    let mut under = TextShape::new(rect.min + shadow.offset, galley.clone(), shadow.color);
    under.override_text_color = Some(shadow.color);
    under.transform(around);
    let mut over = TextShape::new(rect.min, galley, color);
    over.transform(around);
    ui.painter().add(Shape::Text(under));
    ui.painter().add(Shape::Text(over));
    response
}

struct Plan {
    letters: Vec<Letter>,
    words: Vec<Word>,
    caps: Vec<Cap>,
    units: usize,
    pad: f32,
}

struct Letter {
    ch: char,
    format: TextFormat,
    leading: f32,
    letter: usize,
}

struct Word {
    letters: Range<usize>,
    motion: Option<TextMotion>,
}

struct Cap {
    letters: Range<usize>,
    letter: usize,
    color: Color32,
}

#[derive(Clone, Copy)]
struct Placed {
    baseline: Pos2,
    advance: f32,
    ascent: f32,
    height: f32,
}

impl Plan {
    fn new(line: &StyledLine, keys: &KeyNames, look: TextLook) -> Plan {
        let pad = look.size * CAP_PAD_EM;
        let mut plan = Plan {
            letters: Vec::new(),
            words: Vec::new(),
            caps: Vec::new(),
            units: 0,
            pad,
        };
        let mut letter = 0;
        let mut owed = 0.0;
        let mut open = false;
        for piece in &line.pieces {
            match piece {
                TextPiece::Pause(_) => {}
                TextPiece::Key(input) => {
                    let format = TextFormat {
                        line_height: look.line_height,
                        ..TextFormat::simple(Face::Mono.id(look.size * CAP_SCALE), look.color)
                    };
                    let start = plan.letters.len();
                    for (at, ch) in keys.name(*input).chars().enumerate() {
                        let leading = if at == 0 { owed + pad } else { 0.0 };
                        plan.letters.push(Letter {
                            ch,
                            format: format.clone(),
                            leading,
                            letter,
                        });
                    }
                    let letters = start..plan.letters.len();
                    plan.words.push(Word {
                        letters: letters.clone(),
                        motion: None,
                    });
                    plan.caps.push(Cap {
                        letters,
                        letter,
                        color: look.color,
                    });
                    owed = pad;
                    open = false;
                    letter += 1;
                }
                TextPiece::Span(span) => {
                    let format = span_format(span.voice, span.ink.unwrap_or(look.color), look);
                    for ch in span.text.chars() {
                        let leading = std::mem::take(&mut owed);
                        plan.letters.push(Letter {
                            ch,
                            format: format.clone(),
                            leading,
                            letter,
                        });
                        letter += 1;
                        let at = plan.letters.len() - 1;
                        if ch.is_whitespace() {
                            open = false;
                            continue;
                        }
                        match plan.words.last_mut() {
                            Some(word) if open => {
                                word.letters.end = at + 1;
                                word.motion = word.motion.or(span.motion);
                            }
                            _ => plan.words.push(Word {
                                letters: at..at + 1,
                                motion: span.motion,
                            }),
                        }
                        open = true;
                    }
                }
            }
        }
        plan.units = letter;
        plan
    }

    fn footprint(&self, galley: &Galley) -> Vec2 {
        let pad = if self.caps.is_empty() { 0.0 } else { self.pad };
        galley.size() + Vec2::new(pad, 0.0)
    }

    fn job(&self, wrap: f32) -> LayoutJob {
        let mut job = LayoutJob::default();
        job.wrap.max_width = wrap;
        for letter in &self.letters {
            let mut buffer = [0; 4];
            job.append(
                letter.ch.encode_utf8(&mut buffer),
                letter.leading,
                letter.format.clone(),
            );
        }
        job
    }
}

fn span_format(voice: TextVoice, color: Color32, look: TextLook) -> TextFormat {
    let (normal, whisper, shout) = match look.hand {
        Hand::Book => (Face::Book, Face::BookItalic, Face::BookBold),
        Hand::Quill => (Face::Quill, Face::Quill, Face::Quill),
    };
    let format = match voice {
        TextVoice::Normal => TextFormat::simple(normal.id(look.size), color),
        TextVoice::Whisper => TextFormat::simple(
            whisper.id(look.size * WHISPER_SCALE),
            color.gamma_multiply(WHISPER_ALPHA),
        ),
        TextVoice::Shout => TextFormat::simple(shout.id(look.size * SHOUT_SCALE), color),
    };
    TextFormat {
        line_height: look.line_height,
        ..format
    }
}

/// egui keeps one glyph per character in its rows, leaving out only the newlines that end them.
fn place(galley: &Galley, plan: &Plan, origin: Pos2) -> Vec<Option<Placed>> {
    let mut glyphs = galley.rows.iter().flat_map(|placed| {
        placed.row.glyphs.iter().map(move |glyph| Placed {
            baseline: origin + placed.pos.to_vec2() + glyph.pos.to_vec2(),
            advance: glyph.advance_width,
            ascent: glyph.font_ascent,
            height: glyph.font_height,
        })
    });
    plan.letters
        .iter()
        .map(|letter| {
            if letter.ch == '\n' {
                None
            } else {
                glyphs.next()
            }
        })
        .collect()
}

fn paint_cap(ui: &Ui, placed: &[Option<Placed>], cap: &Cap, pad: f32) {
    let glyphs: Vec<Placed> = cap.letters.clone().filter_map(|at| placed[at]).collect();
    let (Some(first), Some(last)) = (glyphs.first(), glyphs.last()) else {
        return;
    };
    let top = first.baseline.y - first.ascent;
    let rect = Rect::from_min_max(
        Pos2::new(first.baseline.x - pad, top),
        Pos2::new(last.baseline.x + last.advance + pad, top + first.height),
    );
    ui.painter().rect(
        rect,
        3.0,
        cap.color.gamma_multiply(0.12),
        Stroke::new(1.0, cap.color.gamma_multiply(0.5)),
        StrokeKind::Inside,
    );
}

fn paint_word(
    ui: &Ui,
    plan: &Plan,
    letters: Range<usize>,
    at: Placed,
    motion: Option<TextMotion>,
    phase: f32,
    time: f32,
) {
    let mut job = LayoutJob::default();
    for letter in &plan.letters[letters] {
        let mut buffer = [0; 4];
        job.append(
            letter.ch.encode_utf8(&mut buffer),
            0.0,
            letter.format.clone(),
        );
    }
    let galley: Arc<Galley> = ui.painter().layout_job(job);
    let Some(first) = galley
        .rows
        .first()
        .and_then(|row| Some(row.pos + row.row.glyphs.first()?.pos.to_vec2()))
    else {
        return;
    };
    let pos = at.baseline - first.to_vec2();
    let mut shape = TextShape::new(pos, galley, Color32::PLACEHOLDER);
    match motion {
        None => {}
        Some(TextMotion::Wave) => {
            shape.pos.y += (time * 5.0 - phase * 0.8).sin() * 2.5;
        }
        Some(TextMotion::Shake) => {
            shape.pos += Vec2::new(
                (time * 53.0 + phase * 7.1).sin() * 1.2,
                (time * 47.0 + phase * 3.3).cos() * 1.2,
            );
        }
        Some(TextMotion::Pulse) => {
            let scale = 1.0 + (time * 3.0 - phase * 0.4).sin() * 0.05;
            let center = shape.visual_bounding_rect().center().to_vec2();
            shape.transform(TSTransform::new(center * (1.0 - scale), scale));
        }
    }
    ui.painter().add(Shape::Text(shape));
}
