/// A PNG of `width` × `height` transparent pixels: an image a row can name, the right size and no
/// more.
pub fn png(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut encoder = png::Encoder::new(&mut bytes, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().expect("a png header");
    writer
        .write_image_data(&vec![0; (width * height * 4) as usize])
        .expect("png pixels");
    writer.finish().expect("a png");
    bytes
}

/// A WAV of a moment of silence.
pub fn wav() -> Vec<u8> {
    const RATE: u32 = 8000;
    const SAMPLES: u32 = 8;
    let data = SAMPLES * 2;
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&RATE.to_le_bytes());
    bytes.extend_from_slice(&(RATE * 2).to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data.to_le_bytes());
    bytes.extend(std::iter::repeat_n(0u8, data as usize));
    bytes
}
