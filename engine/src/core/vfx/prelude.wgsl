
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
}

const SITE_ACTOR: u32 = 0u;
const SITE_OBJECT: u32 = 1u;
const SITE_AREA: u32 = 2u;
const SITE_PATH: u32 = 3u;
const SITE_SCREEN: u32 = 4u;
const SITE_WIDGET: u32 = 5u;

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

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    return vfx(in.uv);
}
