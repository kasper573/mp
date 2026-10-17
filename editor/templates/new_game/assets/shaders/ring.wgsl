// A ring that grows from the site's centre to its edge and thins out as it goes.
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let distance = length((uv - 0.5) * 2.0);
    let band = smoothstep(params.width, 0.0, abs(distance - site.progress));
    return params.colour * band * (1.0 - site.progress * 0.6);
}
