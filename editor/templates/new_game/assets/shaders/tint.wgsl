// Blends the site's image toward a colour for the layer's whole duration.
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let pixel = sample(site_uv(uv));
    return vec4<f32>(mix(pixel.rgb, params.colour.rgb, params.amount), pixel.a);
}
