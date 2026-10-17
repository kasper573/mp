// Lightning arcing along a path site: from its first point through every other, a jagged bolt
// that rewrites itself many times a second, a fainter second bolt wandering beside it, a flare where
// each point stands, and a glow around it all that dies with the layer.
//   colour  the glow around the bolts
//   core    the colour of the bolts themselves
//   jitter  how far the bolts stray from the path, in tiles
//   bolts   how many bolts run the path; the first is the brightest
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    if site.point_count < 2u {
        return vec4<f32>(0.0);
    }
    let near = signed_nearest(uv);
    let frame = floor(site.time * 28.0);
    let flicker = 0.7 + 0.3 * hash(frame * 0.37 + 1.3);
    var light = 0.0;
    var glow = 0.0;
    let count = u32(clamp(params.bolts, 1.0, 4.0));
    for (var b = 0u; b < count; b++) {
        let seed = f32(b) * 17.9 + frame * 3.1;
        let weight = select(0.45, 1.0, b == 0u);
        let stray = (noise(near.y * 22.0 + seed) - 0.5) * 2.0 * params.jitter * select(1.6, 1.0, b == 0u);
        let d = abs(near.x - stray);
        light += exp(-d * 22.0) * weight;
        glow += exp(-d * 4.5) * 0.35 * weight;
    }
    var flare = 0.0;
    for (var i = 0u; i < site.point_count; i++) {
        let at = (uv - path_point(i)) * site.tiles;
        flare += exp(-length(at) * 5.0) * select(0.9, 0.5, i == 0u);
    }
    let dying = 1.0 - smoothstep(0.45, 1.0, site.progress);
    let bolt = clamp(light, 0.0, 1.0) * flicker * dying;
    let halo = clamp(glow + flare * 0.8, 0.0, 1.0) * flicker * dying;
    let rgb = mix(params.colour.rgb, params.core.rgb, bolt);
    return vec4<f32>(rgb, max(bolt * params.core.a, halo * params.colour.a));
}

// The signed distance in tiles from a site uv to the path, left of its run negative, and how far
// along the path the nearest point lies, 0 at the start and 1 at the end.
fn signed_nearest(uv: vec2<f32>) -> vec2<f32> {
    var total = 0.0;
    for (var i = 1u; i < site.point_count; i++) {
        total += length((path_point(i) - path_point(i - 1u)) * site.tiles);
    }
    var nearest = 1e9;
    var signed = 0.0;
    var along = 0.0;
    var walked = 0.0;
    let p = uv * site.tiles;
    for (var i = 1u; i < site.point_count; i++) {
        let a = path_point(i - 1u) * site.tiles;
        let b = path_point(i) * site.tiles;
        let ab = b - a;
        let stretch = max(length(ab), 1e-4);
        let t = clamp(dot(p - a, ab) / (stretch * stretch), 0.0, 1.0);
        let foot = a + ab * t;
        let d = length(p - foot);
        if d < nearest {
            nearest = d;
            let side = ab.x * (p.y - a.y) - ab.y * (p.x - a.x);
            signed = select(d, -d, side < 0.0);
            along = (walked + t * stretch) / max(total, 1e-4);
        }
        walked += stretch;
    }
    return vec2<f32>(signed, along);
}

fn hash(x: f32) -> f32 {
    return fract(sin(x * 12.9898) * 43758.5453);
}

fn noise(x: f32) -> f32 {
    let i = floor(x);
    let f = fract(x);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(hash(i), hash(i + 1.0), u);
}
