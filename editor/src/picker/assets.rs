use design_tokens::glyph::{self, Mark};
use egui::Ui;
use engine::core::assets::AssetKind;
use engine::core::content::{ASSETS_DIR, asset_file, asset_of};

use super::{Candidate, Category, Dragged, Pick, PickSource};
use crate::forms::FormCx;
use crate::ui::theme;

/// Files under the assets folder of one kind.
pub struct AssetSource {
    kind: AssetKind,
}

impl AssetSource {
    pub fn of(kind: AssetKind) -> AssetSource {
        AssetSource { kind }
    }

    fn spoken(&self) -> &'static str {
        self.kind.into()
    }
}

impl PickSource for AssetSource {
    fn placeholder(&self) -> String {
        format!("{} file", self.spoken())
    }

    fn categories(&self, _cx: &FormCx) -> Vec<Category> {
        Vec::new()
    }

    fn candidates(&self, cx: &FormCx) -> Vec<Candidate> {
        cx.files
            .paths_under(&format!("{ASSETS_DIR}/"))
            .map(|file| asset_of(file))
            .filter(|path| AssetKind::of(path) == Some(self.kind))
            .map(|path| Candidate {
                pick: Pick::new(self.spoken(), path),
                category: self.spoken().to_owned(),
                name: String::new(),
                hint: path
                    .rsplit_once('/')
                    .map(|(folder, _)| folder)
                    .unwrap_or("")
                    .to_owned(),
                blocked: None,
                scope: 0,
            })
            .collect()
    }

    fn accepts(&self, _cx: &FormCx, dragged: &Dragged) -> Result<Pick, String> {
        let Dragged::Asset(path) = dragged else {
            return Err(format!(
                "this field takes {} files, not rows",
                self.spoken()
            ));
        };
        if AssetKind::of(path) != Some(self.kind) {
            return Err(format!(
                "this field takes {} files, not {path}",
                self.spoken()
            ));
        }
        Ok(Pick::new(self.spoken(), path.as_str()))
    }

    fn shown(&self, pick: &Pick) -> (String, String) {
        (format!("{ASSETS_DIR}/"), pick.key.clone())
    }

    fn thumbnail(&self, ui: &mut Ui, cx: &mut FormCx, pick: &Pick, size: f32) {
        match AssetKind::of(&pick.key) {
            Some(AssetKind::Image) => {
                let ctx = ui.ctx().clone();
                if let Some(thumb) = cx.state.thumbnails.image(&ctx, cx.files, &pick.key) {
                    let [w, h] = thumb.size;
                    let scale = (size / h.max(1) as f32)
                        .min(size / w.max(1) as f32)
                        .min(1.0);
                    ui.add(egui::Image::from_texture((
                        thumb.texture.id(),
                        egui::vec2(w as f32 * scale, h as f32 * scale),
                    )));
                }
            }
            Some(AssetKind::Audio) => {
                glyph::show(ui, Mark::Note, 13.0, theme::MUTED);
            }
            Some(AssetKind::Font) => {
                ui.label(theme::muted("A"));
            }
            None => {}
        }
    }

    fn footer(&self, _cx: &FormCx, pick: &Pick) -> String {
        asset_file(&pick.key)
    }
}
