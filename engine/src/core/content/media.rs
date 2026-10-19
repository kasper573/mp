use std::collections::HashMap;
use std::io::Cursor;

use rayon::prelude::*;

use super::load::Loading;
use super::report::{ContentProblem, ErrorPlace};

pub struct ImageSizes(pub HashMap<String, (u32, u32)>);

type MediaCheck = Result<Option<(u32, u32)>, (&'static str, String, &'static str)>;

pub fn check_media(loading: &mut Loading) {
    let paths: Vec<String> = loading.assets().to_vec();
    let folder = loading.folder();
    let checked: Vec<(String, MediaCheck)> = paths
        .into_par_iter()
        .map(|path| {
            let bytes = match folder.read(&super::asset_file(&path)) {
                Ok(bytes) => bytes,
                Err(error) => {
                    return (
                        path,
                        Err(("unreadable file", error.to_string(), "a readable file")),
                    );
                }
            };
            let lower = path.to_ascii_lowercase();
            let result = if lower.ends_with(".png") {
                measure_png(&bytes)
                    .map(Some)
                    .map_err(|error| ("unreadable image", error, "a PNG that decodes"))
            } else if lower.ends_with(".wav") {
                (bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE")
                    .then_some(None)
                    .ok_or((
                        "unreadable sound",
                        "no RIFF WAVE header".to_owned(),
                        "a WAV file",
                    ))
            } else if lower.ends_with(".flac") {
                (bytes.len() >= 4 && &bytes[..4] == b"fLaC")
                    .then_some(None)
                    .ok_or((
                        "unreadable sound",
                        "no FLAC header".to_owned(),
                        "a FLAC file",
                    ))
            } else if lower.ends_with(".ttf") || lower.ends_with(".otf") {
                (bytes.len() >= 4
                    && matches!(&bytes[..4], [0, 1, 0, 0] | b"true" | b"OTTO" | b"ttcf"))
                .then_some(None)
                .ok_or((
                    "unreadable font",
                    "no TrueType or OpenType header".to_owned(),
                    "a TrueType or OpenType font",
                ))
            } else {
                Ok(None)
            };
            (path, result)
        })
        .collect();
    let mut sizes = HashMap::new();
    for (path, result) in checked {
        match result {
            Ok(Some(size)) => {
                sizes.insert(path, size);
            }
            Ok(None) => {}
            Err((rule, found, expected)) => loading.file_error(
                super::asset_file(&path),
                ErrorPlace::WholeFile,
                ContentProblem::new(rule, found, expected),
            ),
        }
    }
    loading.built(ImageSizes(sizes));
}

pub struct VisiblePixelColumns {
    pub first: u32,
    pub last: u32,
    pub image_width: u32,
}

pub fn visible_columns(bytes: &[u8]) -> Result<Option<VisiblePixelColumns>, String> {
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(
        png::Transformations::normalize_to_color8() | png::Transformations::ALPHA,
    );
    let mut reader = decoder.read_info().map_err(|error| error.to_string())?;
    let size = reader
        .output_buffer_size()
        .ok_or_else(|| "an image too large to decode".to_owned())?;
    let mut pixels = vec![0; size];
    let frame = reader
        .next_frame(&mut pixels)
        .map_err(|error| error.to_string())?;
    let channels = frame.color_type.samples();
    let alpha = channels - 1;
    let mut covered: Option<(u32, u32)> = None;
    for row in pixels[..frame.buffer_size()].chunks_exact(frame.line_size) {
        let opaque = |(column, pixel): (usize, &[u8])| (pixel[alpha] > 0).then_some(column as u32);
        let mut columns = row[..frame.width as usize * channels]
            .chunks_exact(channels)
            .enumerate()
            .filter_map(opaque);
        let Some(first) = columns.next() else {
            continue;
        };
        let last = columns.next_back().unwrap_or(first);
        covered = Some(covered.map_or((first, last), |(left, right)| {
            (left.min(first), right.max(last))
        }));
    }
    Ok(covered.map(|(first, last)| VisiblePixelColumns {
        first,
        last,
        image_width: frame.width,
    }))
}

fn measure_png(bytes: &[u8]) -> Result<(u32, u32), String> {
    let decoder = png::Decoder::new(Cursor::new(bytes));
    let reader = decoder.read_info().map_err(|error| error.to_string())?;
    let info = reader.info();
    Ok((info.width, info.height))
}
