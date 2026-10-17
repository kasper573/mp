// A burst of colour over the site's image that dies away as the layer plays out.
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let pixel = sample(site_uv(uv));
    let flash = params.strength * (1.0 - site.progress);
    return vec4<f32>(mix(pixel.rgb, params.colour.rgb, clamp(flash, 0.0, 1.0)), pixel.a);
}
