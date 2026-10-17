// Specks of light drifting up through the site: embers over a burning actor, motes of blessing,
// bubbles of poison. Each mote is born low, rises at its own pace, sways a little and fades at the
// top, over and over for as long as the layer plays. Drawn over the site's own image when it has one.
//   colour  the motes' colour; its alpha scales them all
//   count   how many motes are in the air at once
//   speed   how fast they rise, in site heights per second
//   size    a mote's radius, as a fraction of the site's width
//   spread  how wide the swarm is, as a fraction of the site's width
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let suv = site_uv(uv);
    let image = sample(suv);
    let count = u32(clamp(params.count, 1.0, 64.0));
    let aspect = site.size.y / max(site.size.x, 1.0);
    var light = 0.0;
    for (var i = 0u; i < count; i++) {
        let seed = f32(i) * 7.31;
        let pace = 0.6 + 0.8 * hash(seed + 1.7);
        let life = fract(site.time * params.speed * pace * 0.5 + hash(seed + 3.1));
        let lane = (hash(seed + 5.3) - 0.5) * params.spread;
        let sway = sin(site.time * (1.5 + hash(seed + 9.2) * 2.0) + seed) * 0.06;
        let at = vec2<f32>(0.5 + lane + sway, 1.0 - life);
        let d = length((suv - at) * vec2<f32>(1.0, aspect));
        let bright = (1.0 - smoothstep(0.0, max(params.size, 0.005), d));
        let fade = sin(life * 3.1415926) * (0.6 + 0.4 * hash(seed + 11.0));
        light += bright * fade;
    }
    let settling = 1.0 - smoothstep(0.75, 1.0, site.progress);
    let glow = clamp(light, 0.0, 1.0) * settling * params.colour.a;
    return vec4<f32>(mix(image.rgb, params.colour.rgb, glow), max(image.a, glow));
}

fn hash(x: f32) -> f32 {
    return fract(sin(x * 12.9898) * 43758.5453);
}
