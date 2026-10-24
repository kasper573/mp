// A status taking hold or letting go: pale at its head deepening to violet at its foot, rimmed in
// dark ink and haloed in a violet light, flashing white as it bursts and fading as it ends.
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let at = site_uv(uv);
    let ink = sample(at).a;
    let rim = max(reach(at, 1.0), reach(at, 1.8));
    let shadow = reach(at - vec2<f32>(1.5, 2.0) * site.pixel, 1.5);
    let halo = reach(at, 4.5);
    let fresh = 1.0 - smoothstep(0.0, 0.12, site.progress);
    let tone = mix(params.fill.rgb, params.deep.rgb, smoothstep(0.3, 0.62, at.y));
    let face = mix(tone, vec3<f32>(1.0), fresh * 0.8);
    let haloed = vec4<f32>(params.glow.rgb, halo * 0.3 * params.glow_strength);
    let shadowed = over(vec4<f32>(params.edge.rgb, shadow * 0.7), haloed);
    let rimmed = over(vec4<f32>(params.edge.rgb, rim), shadowed);
    let painted = over(vec4<f32>(face, ink), rimmed);
    return vec4<f32>(painted.rgb, painted.a * (1.0 - smoothstep(0.65, 1.0, site.progress)));
}

// The most ink within `radius` pixels of a site uv: the glyphs grown out by that much.
fn reach(at: vec2<f32>, radius: f32) -> f32 {
    var most = 0.0;
    for (var i = 0; i < 12; i++) {
        let turn = f32(i) / 12.0 * 6.2831853;
        most = max(most, sample(at + vec2<f32>(cos(turn), sin(turn)) * radius * site.pixel).a);
    }
    return most;
}
