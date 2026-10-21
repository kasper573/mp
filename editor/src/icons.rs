//! What stands for a file wherever the editor lists one: a picture of what it holds when it has
//! one, or else the icon of its kind.

use design_tokens::glyph::{Icon, Mark, phosphor};
use design_tokens::ink;
use egui::{Color32, Painter, Rect, TextureId, Vec2};
use engine::core::assets::{AssetKind, ImageRef};
use engine::core::audio::playback::{SfxDef, SfxRoleDef};
use engine::core::babble::{BabbleBankDef, BabbleDef};
use engine::core::content::{ContentFile, SETTINGS_FILE, table_of};
use engine::core::vfx::VfxDef;
use engine::core::vfx::shader::VfxShaderDef;
use engine::systems::actor::ModelDef;
use engine::systems::area::AreaDef;
use engine::systems::area::blueprint::BlueprintDef;
use engine::systems::area::tileset::{SurfaceDef, TilesetDef};
use engine::systems::area::world_map::WorldMapDef;
use engine::systems::attention::AttentionDef;
use engine::systems::class::ClassDef;
use engine::systems::input::map::InputDef;
use engine::systems::interface::{CursorDef, InterfaceIconDef};
use engine::systems::item::ItemDef;
use engine::systems::memory::MemoryDef;
use engine::systems::notification::NotificationDef;
use engine::systems::npc::NpcDef;
use engine::systems::player::PlayerDef;
use engine::systems::player::snapshot::CharacterSnapshot;
use engine::systems::quest::QuestDef;
use engine::systems::script::ScriptDef;
use engine::systems::shop::ShopDef;
use engine::systems::skill::SkillDef;
use engine::systems::status::StatusEffectDef;

use crate::project::files::FolderIndex;
use crate::project::{Project, ProjectFiles};
use crate::thumbs::{self, Thumbnails};
use crate::views::model::{self, ModelStrip};

/// The largest picture, in pixels each way, that still reads as an icon; a bigger one leaves its
/// file to its kind's icon.
pub const PREVIEW_MAX: f32 = 64.0;

/// How many pictures a list decodes in one frame, so opening a long list never stalls a frame.
pub const DECODES_PER_FRAME: u32 = 4;

/// The icon of a kind of file, with a smaller badge on its corner for a kind that is a variant of
/// another.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct KindIcon {
    pub icon: Icon,
    pub badge: Option<Icon>,
}

impl KindIcon {
    const fn plain(glyph: &'static str) -> KindIcon {
        KindIcon {
            icon: Icon::regular(glyph),
            badge: None,
        }
    }

    const fn badged(glyph: &'static str, badge: &'static str) -> KindIcon {
        KindIcon {
            icon: Icon::regular(glyph),
            badge: Some(Icon::fill(badge)),
        }
    }

    pub fn paint(self, painter: &Painter, rect: Rect, color: Color32) {
        self.icon.paint(painter, rect, color);
        let Some(badge) = self.badge else {
            return;
        };
        let size = rect.width().min(rect.height()) * 0.6;
        let at = rect.right_bottom() - Vec2::splat(size * 0.4);
        painter.circle_filled(at, size * 0.55, ink::CREAM);
        badge.paint(
            painter,
            Rect::from_center_size(at, Vec2::splat(size * 0.85)),
            ink::WAX,
        );
    }
}

impl From<Mark> for KindIcon {
    fn from(mark: Mark) -> KindIcon {
        KindIcon {
            icon: mark.icon(),
            badge: None,
        }
    }
}

/// The icon of the content files of `table`.
pub fn of_table(table: &str) -> KindIcon {
    match table {
        AreaDef::TABLE => KindIcon::plain(phosphor::MAP_TRIFOLD),
        BlueprintDef::TABLE => KindIcon::plain(phosphor::STAMP),
        TilesetDef::TABLE => KindIcon::plain(phosphor::SQUARES_FOUR),
        SurfaceDef::TABLE => KindIcon::plain(phosphor::FOOTPRINTS),
        WorldMapDef::TABLE => KindIcon::plain(phosphor::GLOBE_HEMISPHERE_WEST),
        NpcDef::TABLE => KindIcon::plain(phosphor::ROBOT),
        PlayerDef::TABLE => KindIcon::plain(phosphor::USER),
        CharacterSnapshot::TABLE => KindIcon::badged(phosphor::USER, phosphor::FLASK),
        ClassDef::TABLE => KindIcon::plain(phosphor::SHIELD_STAR),
        ModelDef::TABLE => KindIcon::plain(phosphor::PERSON_ARMS_SPREAD),
        ItemDef::TABLE => KindIcon::plain(phosphor::BACKPACK),
        SkillDef::TABLE => KindIcon::plain(phosphor::LIGHTNING),
        StatusEffectDef::TABLE => KindIcon::plain(phosphor::HEARTBEAT),
        QuestDef::TABLE => KindIcon::plain(phosphor::SCROLL),
        ShopDef::TABLE => KindIcon::plain(phosphor::STOREFRONT),
        MemoryDef::TABLE => KindIcon::plain(phosphor::BRAIN),
        NotificationDef::TABLE => KindIcon::plain(phosphor::BELL_RINGING),
        ScriptDef::TABLE => KindIcon::plain(phosphor::TREE_STRUCTURE),
        InputDef::TABLE => KindIcon::plain(phosphor::KEYBOARD),
        CursorDef::TABLE => KindIcon::plain(phosphor::CURSOR),
        InterfaceIconDef::TABLE => KindIcon::plain(phosphor::APP_WINDOW),
        AttentionDef::TABLE => KindIcon::plain(phosphor::SEAL_WARNING),
        SfxDef::TABLE => KindIcon::plain(phosphor::SPEAKER_HIGH),
        SfxRoleDef::TABLE => KindIcon::badged(phosphor::SPEAKER_HIGH, phosphor::TAG),
        BabbleDef::TABLE => KindIcon::plain(phosphor::WAVEFORM),
        BabbleBankDef::TABLE => KindIcon::plain(phosphor::CHATS),
        VfxDef::TABLE => KindIcon::plain(phosphor::SPARKLE),
        VfxShaderDef::TABLE => KindIcon::plain(phosphor::MAGIC_WAND),
        _ => FILE,
    }
}

/// The icon of the file at `path` in the game folder, by what kind of file it is.
pub fn of_file(index: &FolderIndex, path: &str) -> KindIcon {
    if path == SETTINGS_FILE {
        return KindIcon::from(Mark::Settings);
    }
    if index.folders.contains(path) {
        return KindIcon::from(Mark::Folder);
    }
    if index.notes.contains(path) {
        return NOTE;
    }
    if index.media.contains(path) {
        return of_media(path);
    }
    table_of(path).map_or(FILE, of_table)
}

/// The icon of a media file, by its kind.
pub fn of_media(path: &str) -> KindIcon {
    match AssetKind::of(path) {
        Some(AssetKind::Image) => IMAGE,
        Some(AssetKind::Audio) => KindIcon::plain(phosphor::FILE_AUDIO),
        Some(AssetKind::Font) => KindIcon::plain(phosphor::TEXT_AA),
        None => FILE,
    }
}

const FILE: KindIcon = KindIcon::plain(phosphor::FILE);
pub const NOTE: KindIcon = KindIcon::plain(phosphor::NOTE);
pub const IMAGE: KindIcon = KindIcon::plain(phosphor::IMAGE);
pub const TABLE: KindIcon = KindIcon::plain(phosphor::TABLE);

/// The picture a file is known by: the picture itself for an image, a content file's icon or
/// image, a model's first idle frame facing the camera, a character's model's, a tileset's
/// first tiles.
pub struct Picture {
    pub path: String,
    pub frame: PictureFrame,
}

pub enum PictureFrame {
    Sprite { size: (u32, u32), frame: u32 },
    Whole,
    Tile(u32),
}

pub fn picture_of(project: &Project, path: &str) -> Option<Picture> {
    if AssetKind::of(path) == Some(AssetKind::Image) {
        return Some(Picture {
            path: path.to_owned(),
            frame: PictureFrame::Whole,
        });
    }
    let whole = |image: &ImageRef| {
        Some(Picture {
            path: image.as_str().to_owned(),
            frame: PictureFrame::Whole,
        })
    };
    let worn = |model| sprite(&*project.read_id::<ModelDef>(model)?);
    match table_of(path)? {
        ModelDef::TABLE => sprite(&*project.read::<ModelDef>(path).ok()?),
        NpcDef::TABLE => worn(project.read::<NpcDef>(path).ok()?.model),
        PlayerDef::TABLE => worn(project.read::<PlayerDef>(path).ok()?.model),
        ItemDef::TABLE => whole(&project.read::<ItemDef>(path).ok()?.icon),
        SkillDef::TABLE => whole(&project.read::<SkillDef>(path).ok()?.icon),
        AttentionDef::TABLE => whole(&project.read::<AttentionDef>(path).ok()?.icon),
        InterfaceIconDef::TABLE => whole(&project.read::<InterfaceIconDef>(path).ok()?.image),
        CursorDef::TABLE => whole(&project.read::<CursorDef>(path).ok()?.image),
        TilesetDef::TABLE => {
            let tileset = project.read::<TilesetDef>(path).ok()?;
            Some(Picture {
                path: tileset.image.as_str().to_owned(),
                frame: PictureFrame::Tile(tileset.tile),
            })
        }
        _ => None,
    }
}

/// A picture ready to draw: which part of which texture, and its own size in pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Preview {
    pub texture: TextureId,
    pub uv: Rect,
    pub size: Vec2,
}

impl Preview {
    /// Draws the picture as large as fits in `rect`, centred, its pixels kept square.
    pub fn paint(self, painter: &Painter, rect: Rect) {
        painter.image(self.texture, self.fit(rect), self.uv, Color32::WHITE);
    }

    /// The rect the picture is drawn in to fit in `rect`.
    pub fn fit(self, rect: Rect) -> Rect {
        let scale = (rect.width() / self.size.x).min(rect.height() / self.size.y);
        Rect::from_center_size(rect.center(), self.size * scale)
    }

    fn small(self) -> bool {
        self.size.x <= PREVIEW_MAX && self.size.y <= PREVIEW_MAX
    }
}

/// The picture of the file at `path` at any size, decoded within `budget`.
pub fn picture(
    ctx: &egui::Context,
    thumbnails: &mut Thumbnails,
    project: &Project,
    path: &str,
    budget: &mut u32,
) -> Option<Preview> {
    let picture = picture_of(project, path)?;
    shown(ctx, thumbnails, &project.files, &picture, budget)
}

/// The picture of the file at `path`, when it is small enough to stand in for its kind's icon.
pub fn preview(
    ctx: &egui::Context,
    thumbnails: &mut Thumbnails,
    project: &Project,
    path: &str,
    budget: &mut u32,
) -> Option<Preview> {
    let files = &project.files;
    let picture = picture_of(project, path)?;
    let small = match picture.frame {
        PictureFrame::Sprite { size, .. } => {
            size.0 as f32 <= PREVIEW_MAX && size.1 as f32 <= PREVIEW_MAX
        }
        PictureFrame::Whole | PictureFrame::Tile(_) => thumbnails
            .dimensions(files, &picture.path)
            .is_some_and(|[w, h]| w as f32 <= PREVIEW_MAX && h as f32 <= PREVIEW_MAX),
    };
    if !small {
        return None;
    }
    shown(ctx, thumbnails, files, &picture, budget).filter(|preview| preview.small())
}

/// What stands for the file at `path` in a list: its preview, or else its kind's icon.
pub fn paint_file(
    painter: &Painter,
    rect: Rect,
    preview: Option<Preview>,
    kind: KindIcon,
    color: Color32,
) {
    match preview {
        Some(preview) => preview.paint(painter, rect),
        None => kind.paint(painter, rect, color),
    }
}

fn shown(
    ctx: &egui::Context,
    thumbnails: &mut Thumbnails,
    files: &ProjectFiles,
    picture: &Picture,
    budget: &mut u32,
) -> Option<Preview> {
    let ready = |thumb: thumbs::Thumbnail, uv: Rect, size: Vec2| Preview {
        texture: thumb.texture.id(),
        uv,
        size,
    };
    Some(match picture.frame {
        PictureFrame::Sprite { size, frame } => {
            let thumb = thumbnails.trimmed_cell(ctx, files, &picture.path, size, frame, budget)?;
            let drawn = Vec2::new(thumb.size[0] as f32, thumb.size[1] as f32);
            ready(thumb, thumbs::FULL_UV, drawn)
        }
        PictureFrame::Whole => {
            let thumb = thumbnails.image_within(ctx, files, &picture.path, budget)?;
            let size = Vec2::new(thumb.size[0] as f32, thumb.size[1] as f32);
            ready(thumb, thumbs::FULL_UV, size)
        }
        PictureFrame::Tile(tile) => {
            let thumb = thumbnails.image_within(ctx, files, &picture.path, budget)?;
            let block = Vec2::splat(tile as f32 * 2.0)
                .min(Vec2::new(thumb.size[0] as f32, thumb.size[1] as f32));
            let uv = thumbs::uv(thumb.size, 0.0, 0.0, block.x, block.y);
            ready(thumb, uv, block)
        }
    })
}

fn sprite(model: &ModelDef) -> Option<Picture> {
    let idle = model::strip_of(model, ModelStrip::default());
    Some(Picture {
        path: model.sprites.image.as_str().to_owned(),
        frame: PictureFrame::Sprite {
            size: model::frame_size(model)?,
            frame: idle.first().map_or(0, |frame| frame.frame),
        },
    })
}
