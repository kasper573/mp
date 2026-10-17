// Holy ground over a rectangle: light wells up from the floor in slow columns, a bright seam marks
// the edge of the blessed square and motes float up out of it, all fading as the layer ends.
//   colour  the light; its alpha scales the whole effect
//   rays    how many columns of light stand across the square
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let distance = area_distance(uv);
    let inside = 1.0 - smoothstep(-0.08, 0.04, distance);
    let p = area_local(uv);
    let t = site.progress;
    let rising = smoothstep(0.0, 0.2, t);
    let settling = 1.0 - smoothstep(0.7, 1.0, t);
    let columns = 0.5 + 0.5 * sin(p.y * params.rays * 2.2 + site.time * 0.9 + sin(p.x * 1.3 + site.time * 0.5));
    let rays = pow(columns, 3.0);
    let breath = 0.9 + 0.1 * sin(site.time * 2.4);
    let floor_glow = (0.18 + 0.3 * rays) * breath * inside;
    let seam = smoothstep(-0.3, -0.02, distance) * inside * 0.7;
    var motes = 0.0;
    for (var i = 0u; i < 14u; i++) {
        let seed = f32(i) * 5.17;
        let life = fract(site.time * (0.25 + 0.2 * hash(seed + 1.0)) + hash(seed + 2.0));
        let at = vec2<f32>(0.1 + 0.8 * hash(seed + 3.0), 0.95 - life * 0.9);
        let d = length((uv - at) * site.tiles);
        motes += (1.0 - smoothstep(0.0, 0.14, d)) * sin(life * 3.1415926);
    }
    let glow = clamp(floor_glow + seam + motes * inside, 0.0, 1.0) * rising * settling;
    let rgb = mix(params.colour.rgb, vec3<f32>(1.0, 1.0, 0.95), clamp(motes + seam * 0.4, 0.0, 1.0));
    return vec4<f32>(rgb, glow * params.colour.a);
}

fn hash(x: f32) -> f32 {
    return fract(sin(x * 12.9898) * 43758.5453);
}
