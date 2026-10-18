use design_tokens::Face;
use design_tokens::raster::raster;

#[test]
fn a_line_is_inked_inside_a_clear_ring_of_its_padding() {
    let pad = 6;
    let drawn = raster(Face::BookBold, 24.0, "42", pad);

    assert_eq!(drawn.coverage.len(), (drawn.width * drawn.height) as usize);
    assert!(drawn.coverage.iter().any(|&ink| ink == 255));
    let ringed = (0..drawn.height).all(|y| {
        (0..drawn.width).all(|x| {
            let inside =
                (pad..drawn.width - pad).contains(&x) && (pad..drawn.height - pad).contains(&y);
            inside || drawn.coverage[(y * drawn.width + x) as usize] == 0
        })
    });
    assert!(ringed);
}

#[test]
fn a_longer_line_is_wider_and_as_tall() {
    let pad = 4;
    let short = raster(Face::BookBold, 24.0, "7", pad);
    let long = raster(Face::BookBold, 24.0, "777", pad);

    assert!(long.width - 2 * pad > (short.width - 2 * pad) * 2);
    assert_eq!(long.height, short.height);
}

#[test]
fn a_line_is_as_tall_as_its_face_sets_it_at_that_size() {
    let small = raster(Face::SmallCapsBold, 20.0, "Guarded", 0);
    let large = raster(Face::SmallCapsBold, 40.0, "Guarded", 0);

    assert!(small.height as f32 >= 20.0);
    assert!(large.height.abs_diff(small.height * 2) <= 2);
}
