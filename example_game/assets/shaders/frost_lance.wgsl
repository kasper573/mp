// Lances of ice thrust across the site: each a faceted shaft of ice, dark at its heart and bright
// along its edge with a glint running its length, barbed with crystal spurs and drawn to a point,
// that grows from its start, slow to leave and quick to land, trailing frozen vapour. Where it
// lands it bursts: a flash, two rings, crystals jutting up from the ground around the point,
// splinters flying on over the margin, and a glittering patch of frost left behind. Then the
// shaft crumbles, breaking into pieces that scatter and vanish. How many lances, and where,
// follows the body: a circle sends them out from its centre in every direction, a rectangle a
// rank of them in unison along its facing, a cone a fan from its point, a line one or several
// side by side, a path a single lance snaking through every bend, a sprite one lance driven into
// its middle, which leaves the body rimed with frost. Drawn on the pixel grid in flat tones.
//   color   the ice; its alpha scales the whole effect
//   shards  how many splinters each lance bursts into where it lands
const MAX_LANCES: u32 = 12u;
const THRUST: f32 = 0.35;
const BURST: f32 = 0.4;
const PIECE: f32 = 0.35;
const SPIKES: u32 = 6u;

// What a lance leaves at a point: ice in its three tones (dark, mid, bright), the white of its
// glints and flashes, the frost on the ground and the vapour in the air.
struct Ice {
    dark: f32,
    mid: f32,
    bright: f32,
    white: f32,
    frost: f32,
    vapour: f32,
}

fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let suv = site_uv(pixel_uv(uv));
    let image = sample(suv);
    let p = site_local(suv);
    let pixel = site.tiles.x / max(site.size.x, 1.0);
    let t = site.progress;
    let on_sprite = site.kind == SITE_ACTOR || site.kind == SITE_OBJECT;
    var ice = Ice(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    var landed = vec2<f32>(0.0);
    if site.kind == SITE_PATH && site.point_count >= 2u {
        let near = path_nearest(suv);
        let length_ = path_length();
        landed = site_local(path_point(site.point_count - 1u));
        ice = strike(near.y * length_, near.x, length_, t, pixel, 0.0, p - landed);
    } else {
        let count = lance_count();
        for (var i = 0u; i < count; i++) {
            let start = lance_start(i, count);
            let dir = lance_direction(i, count);
            let length_ = lance_length();
            let local = p - start;
            let x = dot(local, dir);
            let y = dot(local, vec2<f32>(-dir.y, dir.x));
            let end = start + dir * length_;
            ice = brightest(ice, strike(x, y, length_, t, pixel, f32(i), p - end));
            if i == 0u {
                landed = end;
            }
        }
    }
    let lingering = 1.0 - smoothstep(0.7, 1.0, t);
    let tone = params.color.rgb;
    let deep = tone * vec3<f32>(0.3, 0.42, 0.7);
    let mid = tone * vec3<f32>(0.62, 0.8, 0.95);
    var rgb = deep;
    rgb = mix(rgb, mid, step(0.5, ice.mid));
    rgb = mix(rgb, tone, step(0.5, ice.bright));
    rgb = mix(rgb, vec3<f32>(1.0), step(0.5, ice.white));
    let solid = clamp(max(max(ice.dark, ice.mid), max(ice.bright, ice.white)), 0.0, 1.0);
    let frost = step(0.5, ice.frost) * lingering * 0.45;
    let vapour = ice.vapour * 0.4;
    let soft = max(frost, vapour);
    rgb = mix(mix(tone, vec3<f32>(1.0), ice.white), rgb, solid);
    let rimed = select(image, rime(image, suv, p - landed, t, tone), on_sprite);
    return over(vec4<f32>(rgb, max(solid, soft) * params.color.a), rimed);
}

// One lance at a point `x` along and `y` across it, `from_end` being the point relative to where
// the lance lands.
fn strike(x: f32, y: f32, length_: f32, t: f32, pixel: f32, seed: f32, from_end: vec2<f32>) -> Ice {
    var ice = Ice(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    let thrust = pow(clamp(t / THRUST, 0.0, 1.0), 2.0);
    let tip = length_ * thrust;
    let crumbling = max(t - THRUST, 0.0);
    let piece = floor(x / PIECE) + seed * 7.0;
    let delay = 0.05 + 0.25 * hash(piece * 1.7);
    let fall = max(crumbling - delay, 0.0) * step(0.001, crumbling);
    let scatter = select(-1.0, 1.0, hash(piece * 3.1) > 0.5);
    let yy = y - scatter * fall * fall * 10.0;
    let alive = step(fall, 0.25) * step(t, 0.92);
    let taper = clamp((tip - x) / 0.8, 0.0, 1.0);
    let girth = 0.24 * min(length_ / 1.5, 1.0);
    let spur = max(0.0, 0.1 - abs(fract(x / 0.55) - 0.35) * 0.5) * step(0.5, x) * step(x, tip - 0.9);
    let half = girth * taper + spur + pixel;
    let inside = step(0.0, x) * step(x, tip) * alive;
    let shaft = step(abs(yy), half) * inside;
    let rim = step(half - pixel, abs(yy)) * shaft;
    let glint = step(abs(yy + half * 0.4), pixel * 0.6) * shaft * step(pixel * 3.0, half);
    let heart = step(abs(yy - half * 0.2), half * 0.25) * shaft * step(pixel * 4.0, half);
    let point = step(tip - 0.35, x) * shaft;
    ice.dark = max(ice.dark, heart);
    ice.mid = max(ice.mid, shaft);
    ice.bright = max(ice.bright, max(rim, point));
    ice.white = max(ice.white, max(glint, step(tip - 0.12, x) * shaft));
    let behind = step(tip - 1.6, x) * step(x, tip) * step(0.001, thrust) * step(thrust, 0.999);
    let drifting = noise(vec2<f32>(x * 4.0 - site.time * 3.0, y * 5.0 + seed));
    ice.vapour = max(ice.vapour, behind * step(abs(y), half + 0.35) * step(0.58, drifting) * bands(1.0 - (tip - x) / 1.6, 2.0));
    let since = clamp((t - THRUST) / BURST, 0.0, 1.0);
    let struck = step(0.001, since) * step(since, 0.999);
    let d = length(from_end);
    let blaze = 1.0 - smoothstep(0.0, 0.3, since);
    let flash = bands(clamp((1.0 - d / 0.5) * blaze, 0.0, 1.0), 3.0) * struck;
    let ring = step(abs(d - since * 1.3), 0.07) * struck * step(since, 0.75);
    let ring_b = step(abs(d - since * 0.8), 0.05) * struck * step(0.15, since) * step(since, 0.9);
    ice.white = max(ice.white, max(step(0.9, flash), ring));
    ice.bright = max(ice.bright, max(step(0.5, flash), ring_b));
    ice.mid = max(ice.mid, step(0.2, flash));
    for (var k = 0u; k < SPIKES; k++) {
        let hk = f32(k) * 3.7 + seed * 11.0;
        let angle = (f32(k) + 0.5 + 0.4 * hash(hk)) * 6.2831853 / f32(SPIKES);
        let heading = vec2<f32>(cos(angle), sin(angle));
        let grown = min(since * 2.6, 1.0);
        let reach = (0.55 + 0.45 * hash(hk + 1.0)) * grown;
        let along = dot(from_end, heading);
        let across = dot(from_end, vec2<f32>(-heading.y, heading.x));
        let standing = step(since, 0.62 + 0.3 * hash(hk + 2.0));
        let spike = step(0.0, along) * step(along, reach) * step(abs(across), 0.11 * (1.0 - along / max(reach, 0.01)) + pixel) * struck * standing;
        ice.mid = max(ice.mid, spike);
        ice.bright = max(ice.bright, spike * step(along, reach * 0.35));
        ice.white = max(ice.white, spike * step(reach - 0.14, along));
    }
    let count = u32(clamp(params.shards, 1.0, 16.0));
    for (var s = 0u; s < count; s++) {
        let hs = f32(s) * 2.17 + seed * 5.3;
        let heading = normalize(vec2<f32>(hash(hs) - 0.5, hash(hs + 1.0) - 0.5));
        let at = heading * since * (0.7 + 1.4 * hash(hs + 2.0)) + vec2<f32>(0.0, since * since * 0.9);
        let dd = abs(from_end - at);
        let young = step(since, 0.4);
        let square = step(max(dd.x, dd.y), pixel * select(1.1, 2.0, young > 0.5));
        let flying = square * struck * step(since, 0.55 + 0.45 * hash(hs + 3.0));
        ice.bright = max(ice.bright, flying);
        ice.white = max(ice.white, flying * young);
    }
    let spread = 0.75 * min(since * 2.5, 1.0);
    let grain = noise(from_end * 6.0 + seed * 3.0);
    ice.frost = max(ice.frost, step(d, spread) * step(0.5, grain) * step(0.001, since));
    let twinkle = step(0.93, hash(floor(from_end.x * 10.0) * 3.1 + floor(from_end.y * 10.0) * 7.7 + floor(site.time * 6.0)));
    ice.white = max(ice.white, step(d, spread) * step(0.001, since) * twinkle * (1.0 - smoothstep(0.7, 1.0, t)));
    return ice;
}

// A sprite rimed with frost from where the lance struck it: its pixels paled toward the ice in
// a grainy crust that spreads from the point, glinting here and there, and thaws at the end.
fn rime(image: vec4<f32>, suv: vec2<f32>, from_end: vec2<f32>, t: f32, tone: vec3<f32>) -> vec4<f32> {
    let since = clamp((t - THRUST) / BURST, 0.0, 1.0);
    let spread = 1.6 * min(since * 2.0, 1.0);
    let grain = step(0.42, noise(suv * site.tiles * 7.0));
    let crust = step(length(from_end), spread) * grain * step(0.001, since) * (1.0 - smoothstep(0.75, 1.0, t));
    let glint = step(0.96, hash(floor(suv.x * site.size.x) * 1.3 + floor(suv.y * site.size.y) * 2.9 + floor(site.time * 5.0)));
    let rgb = mix(image.rgb, mix(tone, vec3<f32>(1.0), glint), crust * 0.55);
    return vec4<f32>(rgb, image.a);
}

fn brightest(a: Ice, b: Ice) -> Ice {
    return Ice(
        max(a.dark, b.dark),
        max(a.mid, b.mid),
        max(a.bright, b.bright),
        max(a.white, b.white),
        max(a.frost, b.frost),
        max(a.vapour, b.vapour),
    );
}

fn lance_count() -> u32 {
    switch site.shape {
        case SHAPE_CIRCLE: {
            return 8u;
        }
        case SHAPE_RECT, SHAPE_LINE: {
            return clamp(u32(round(site.extent.y / 0.6)), 1u, MAX_LANCES);
        }
        case SHAPE_CONE: {
            return clamp(u32(round(degrees(site.extent.x) / 18.0)), 2u, MAX_LANCES);
        }
        default: {
            return 1u;
        }
    }
}

fn lance_start(index: u32, count: u32) -> vec2<f32> {
    let rank = (f32(index) + 0.5) / f32(count);
    switch site.shape {
        case SHAPE_RECT: {
            return vec2<f32>(-site.extent.x * 0.5, -site.extent.y * 0.5 + rank * site.extent.y);
        }
        case SHAPE_LINE: {
            return vec2<f32>(0.0, -site.extent.y * 0.5 + rank * site.extent.y);
        }
        case SHAPE_CIRCLE, SHAPE_CONE: {
            return vec2<f32>(0.0);
        }
        default: {
            return vec2<f32>(-lance_length(), 0.0);
        }
    }
}

fn lance_direction(index: u32, count: u32) -> vec2<f32> {
    let rank = (f32(index) + 0.5) / f32(count);
    switch site.shape {
        case SHAPE_CIRCLE: {
            let angle = rank * 6.2831853 + 0.3;
            return vec2<f32>(cos(angle), sin(angle));
        }
        case SHAPE_CONE: {
            let angle = (rank - 0.5) * site.extent.x;
            return vec2<f32>(cos(angle), sin(angle));
        }
        default: {
            return vec2<f32>(1.0, 0.0);
        }
    }
}

fn lance_length() -> f32 {
    switch site.shape {
        case SHAPE_CIRCLE, SHAPE_RECT, SHAPE_LINE: {
            return max(site.extent.x, 0.05);
        }
        case SHAPE_CONE: {
            return max(site.extent.y, 0.05);
        }
        default: {
            return site.tiles.x * 0.5 + 1.2;
        }
    }
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
