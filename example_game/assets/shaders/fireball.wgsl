// A fireball landing on its area: a blast front races from the point to the rim, flames roar up
// behind it in ragged tongues and lick past the edge, then die down to embers and a drift of smoke.
// The flames rise through the whole duration, so the longer the layer, the longer the ground burns.
//   heat   how fiercely the flames burn: 1 is a full fireball, less a smoulder
//   smoke  the colour of the smoke left behind
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let p = area_local(uv);
    let radius = max(site.extent.x, 0.05);
    let reach = length(p) / radius;
    let t = site.progress;
    let front = smoothstep(0.0, 0.25, t) * 1.08;
    let rising = p * 2.4 + vec2<f32>(0.0, -site.time * 3.0);
    let turbulence = fbm(rising);
    let detail = fbm(p * 5.0 + vec2<f32>(site.time * 0.7, -site.time * 4.5));
    let lick = (turbulence - 0.5) * 0.45;
    let lit = smoothstep(reach - 0.15, reach + 0.05, front);
    let edge = 1.0 - smoothstep(0.7, 1.08, reach + lick);
    let dying = 1.0 - smoothstep(0.5, 0.9, t);
    let starve = 0.25 + 0.45 * smoothstep(0.3, 0.85, t) + 0.25 * reach;
    let tongue = smoothstep(starve, starve + 0.3, turbulence * 0.7 + detail * 0.5);
    let flame = lit * edge * tongue * params.heat * dying;
    let ring = exp(-abs(reach - front) * 9.0) * (1.0 - smoothstep(0.15, 0.4, t)) * edge;
    let core = exp(-reach * 2.5) * lit * (1.0 - smoothstep(0.0, 0.5, t)) * 0.8;
    let fire = clamp(flame * 1.1 + ring + core, 0.0, 1.4);
    let hot = fire * (0.55 + 0.45 * detail);
    let colour = ramp(hot);
    let ember = pow(detail, 6.0) * 2.0 * lit * edge * (1.0 - smoothstep(0.6, 1.0, t)) * params.heat;
    let smoke_lift = fbm(p * 1.6 + vec2<f32>(0.3, -site.time * 1.1));
    let smoke = smoothstep(0.35, 0.7, t) * (1.0 - smoothstep(0.75, 1.0, t)) * (0.3 + 0.4 * smoke_lift) * edge * lit;
    let fire_alpha = clamp(fire + ember, 0.0, 1.0);
    let rgb = mix(params.smoke.rgb, colour + vec3<f32>(1.0, 0.6, 0.2) * ember, clamp(fire_alpha * 1.6, 0.0, 1.0));
    return vec4<f32>(rgb, max(fire_alpha, smoke * params.smoke.a));
}

// Deep red through orange to yellow as a flame gets hotter; white only at the blast itself.
fn ramp(heat: f32) -> vec3<f32> {
    let ember = vec3<f32>(0.5, 0.04, 0.0);
    let red = vec3<f32>(0.95, 0.18, 0.02);
    let orange = vec3<f32>(1.0, 0.45, 0.05);
    let yellow = vec3<f32>(1.0, 0.82, 0.25);
    let white = vec3<f32>(1.0, 0.97, 0.85);
    let a = mix(ember, red, smoothstep(0.0, 0.3, heat));
    let b = mix(a, orange, smoothstep(0.3, 0.65, heat));
    let c = mix(b, yellow, smoothstep(0.65, 1.0, heat));
    return mix(c, white, smoothstep(1.0, 1.4, heat));
}

fn hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    let a = hash(i);
    let b = hash(i + vec2<f32>(1.0, 0.0));
    let c = hash(i + vec2<f32>(0.0, 1.0));
    let d = hash(i + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2<f32>) -> f32 {
    var value = 0.0;
    var amplitude = 0.55;
    var at = p;
    for (var i = 0; i < 4; i++) {
        value += amplitude * noise(at);
        at = at * 2.1 + vec2<f32>(1.7, 9.2);
        amplitude *= 0.5;
    }
    return value;
}
