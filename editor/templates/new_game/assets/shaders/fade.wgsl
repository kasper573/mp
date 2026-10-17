// Fades the site's image toward a colour as the layer plays out.
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let pixel = sample(site_uv(uv));
    let faded = clamp(site.progress * params.strength, 0.0, 1.0);
    return vec4<f32>(mix(pixel.rgb, params.colour.rgb, faded), pixel.a);
}
