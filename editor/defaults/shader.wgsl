fn vfx(uv: vec2<f32>) -> vec4<f32> {
    return sample(site_uv(uv));
}
