
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_position: vec4<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

struct Site {
    rect: vec4<f32>,
    size: vec2<f32>,
    pixel: vec2<f32>,
    kind: u32,
    facing: f32,
    progress: f32,
    time: f32,
    overscan: f32,
    shape: u32,
    point_count: u32,
    origin: vec2<f32>,
    extent: vec2<f32>,
    tiles: vec2<f32>,
    points: array<vec4<f32>, 8>,
}

const SITE_ACTOR: u32 = 0u;
const SITE_OBJECT: u32 = 1u;
const SITE_AREA: u32 = 2u;
const SITE_PATH: u32 = 3u;
const SITE_SCREEN: u32 = 4u;
const SITE_WIDGET: u32 = 5u;

const SHAPE_NONE: u32 = 0u;
const SHAPE_CIRCLE: u32 = 1u;
const SHAPE_RECT: u32 = 2u;
const SHAPE_CONE: u32 = 3u;
const SHAPE_LINE: u32 = 4u;

@group(2) @binding(0) var site_texture: texture_2d<f32>;
@group(2) @binding(1) var site_sampler: sampler;
@group(2) @binding(2) var<uniform> site: Site;
@group(2) @binding(3) var<uniform> params: Params;

// The quad is drawn `site.overscan` times the site's size, so a shader has room to move or grow
// the image. `site_uv` runs 0..1 over the site itself and past that range on the margin.
fn site_uv(uv: vec2<f32>) -> vec2<f32> {
    return (uv - 0.5) * site.overscan + 0.5;
}

// The site's own image at a site uv, transparent outside it.
fn sample(at: vec2<f32>) -> vec4<f32> {
    let inside = f32(all(at >= vec2<f32>(0.0)) && all(at <= vec2<f32>(1.0)));
    let texel = mix(site.rect.xy, site.rect.zw, clamp(at, vec2<f32>(0.0), vec2<f32>(1.0)));
    return textureSample(site_texture, site_sampler, texel) * inside;
}

// Where a site uv lies in tiles from an area site's point: along its facing, then across it.
// site.facing is in screen terms (y up) where uv, like tiles, runs y down.
fn area_local(uv: vec2<f32>) -> vec2<f32> {
    let offset = (uv - site.origin) * site.tiles;
    let heading = vec2<f32>(cos(site.facing), -sin(site.facing));
    let side = vec2<f32>(-heading.y, heading.x);
    return vec2<f32>(dot(offset, heading), dot(offset, side));
}

// The signed distance in tiles from a site uv to the edge of an area site's footprint, negative
// inside it. A site that is no area counts as all inside.
fn area_distance(uv: vec2<f32>) -> f32 {
    let p = area_local(uv);
    switch site.shape {
        case 1u: {
            return length(p) - site.extent.x;
        }
        case 2u: {
            return box_distance(p, site.extent * 0.5);
        }
        case 3u: {
            let half = site.extent.x * 0.5;
            let reach = length(p);
            let turned = abs(atan2(p.y, p.x)) - half;
            let to_side = reach * sin(clamp(turned, -1.5707964, 1.5707964));
            return max(reach - site.extent.y, to_side);
        }
        case 4u: {
            return box_distance(p - vec2<f32>(site.extent.x * 0.5, 0.0), site.extent * 0.5);
        }
        default: {
            return -1.0;
        }
    }
}

fn box_distance(p: vec2<f32>, half: vec2<f32>) -> f32 {
    let d = abs(p) - half;
    return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0);
}

// A point of a path site, in site uv: the first is where the path starts.
fn path_point(index: u32) -> vec2<f32> {
    let word = site.points[min(index, 15u) / 2u];
    if (index % 2u) == 0u {
        return word.xy;
    }
    return word.zw;
}

// The distance in tiles from a site uv to the nearest stretch of a path site, and how far along the
// whole path, 0 at its start and 1 at its end, the nearest point of it lies: x and y of the result.
fn path_nearest(uv: vec2<f32>) -> vec2<f32> {
    if site.point_count < 2u {
        return vec2<f32>(length((uv - path_point(0u)) * site.tiles), 0.0);
    }
    var total = 0.0;
    for (var i = 1u; i < site.point_count; i++) {
        total += length((path_point(i) - path_point(i - 1u)) * site.tiles);
    }
    var nearest = 1e9;
    var along = 0.0;
    var walked = 0.0;
    for (var i = 1u; i < site.point_count; i++) {
        let a = path_point(i - 1u) * site.tiles;
        let b = path_point(i) * site.tiles;
        let p = uv * site.tiles;
        let ab = b - a;
        let stretch = max(length(ab), 1e-4);
        let t = clamp(dot(p - a, ab) / (stretch * stretch), 0.0, 1.0);
        let d = length(p - (a + ab * t));
        if d < nearest {
            nearest = d;
            along = (walked + t * stretch) / max(total, 1e-4);
        }
        walked += stretch;
    }
    return vec2<f32>(nearest, along);
}

// The distance in tiles from a site uv to the nearest stretch of a path site.
fn path_distance(uv: vec2<f32>) -> f32 {
    return path_nearest(uv).x;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    return vfx(in.uv);
}
