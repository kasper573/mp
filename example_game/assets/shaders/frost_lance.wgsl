// A lance of ice shot along a line site: a faceted shard streaks from the caster to the far end
// inside a cold glow, leaves a crust of frost glittering on the ground it crossed, and shatters
// where the line stops.
//   colour  the ice; its alpha scales the whole effect
//   shards  how many splinters the lance breaks into at the end
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let p = area_local(uv);
    let length_ = max(site.extent.x, 0.05);
    let width = max(site.extent.y, 0.05);
    let t = site.progress;
    let flight = smoothstep(0.0, 0.4, t);
    let tip = length_ * flight;
    let shard_length = min(1.6, length_);
    let tail = tip - shard_length;
    let along = clamp((p.x - tail) / shard_length, 0.0, 1.0);
    let half = width * 0.5 * (1.0 - along * along) * (0.85 + 0.15 * sin(p.x * 9.0)) + 0.05;
    let in_flight = step(tail, p.x) * step(p.x, tip);
    let body = (1.0 - smoothstep(half * 0.5, half, abs(p.y))) * in_flight;
    let facet = 0.6 + 0.4 * noise(p * 7.0 + vec2<f32>(0.0, 3.0));
    let core = (1.0 - smoothstep(0.0, half * 0.4, abs(p.y))) * in_flight;
    let cold = exp(-abs(p.y) * 2.2) * in_flight * 0.55;
    let flying = 1.0 - smoothstep(0.4, 0.55, t);
    let shard = (body * facet + core + cold) * flying;
    let on_ground = 1.0 - smoothstep(0.0, 0.15, area_distance(uv));
    let crossed = step(p.x, tip) * on_ground;
    let crust = crossed * (0.4 + 0.3 * noise(p * 3.5 + vec2<f32>(0.0, site.time * 0.3)));
    let glitter = pow(noise(p * 14.0 + vec2<f32>(site.time * 0.5, 0.0)), 7.0) * 3.0 * crossed;
    let lingering = 1.0 - smoothstep(0.6, 1.0, t);
    var burst = 0.0;
    let splinters = u32(clamp(params.shards, 1.0, 16.0));
    let since_hit = clamp((t - 0.4) / 0.35, 0.0, 1.0);
    for (var i = 0u; i < splinters; i++) {
        let seed = f32(i) * 2.17;
        let heading = vec2<f32>(0.3 + 0.7 * hash(seed), (hash(seed + 1.0) - 0.5) * 2.0);
        let at = vec2<f32>(length_, 0.0) + normalize(heading) * since_hit * (0.8 + 1.2 * hash(seed + 2.0));
        burst += exp(-length(p - at) * 5.0) * (1.0 - since_hit) * step(0.001, since_hit);
    }
    let flash = exp(-length(p - vec2<f32>(length_, 0.0)) * 2.5) * (1.0 - since_hit) * step(0.001, since_hit) * 0.8;
    let ice = clamp(shard + burst + flash, 0.0, 1.0);
    let frost = clamp(crust + glitter, 0.0, 1.0) * lingering;
    let bright = clamp(core + burst * 0.6 + glitter * 0.5 + flash, 0.0, 1.0);
    let rgb = mix(params.colour.rgb, vec3<f32>(1.0, 1.0, 1.0), bright);
    return vec4<f32>(rgb, max(ice, frost) * params.colour.a);
}

fn hash(x: f32) -> f32 {
    return fract(sin(x * 12.9898) * 43758.5453);
}

fn hash2(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    let a = hash2(i);
    let b = hash2(i + vec2<f32>(1.0, 0.0));
    let c = hash2(i + vec2<f32>(0.0, 1.0));
    let d = hash2(i + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
