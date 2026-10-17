// A shell of light around an actor: a translucent bubble just larger than the sprite, brightest at
// its rim, with bands of shimmer crossing it. The sprite shows through. The bubble fades in and out
// at the layer's ends, so a status replaying it as its `during` vfx keeps it up without a seam.
//   colour    the shell; its alpha scales it
//   strength  how solid the shell looks: 1 is a full ward
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let suv = site_uv(uv);
    let image = sample(suv);
    let e = (suv - vec2<f32>(0.5, 0.52)) * vec2<f32>(1.0, 0.72);
    let r = length(e);
    let radius = 0.34;
    let rim = 1.0 - smoothstep(0.012, 0.045, abs(r - radius));
    let shell = (1.0 - smoothstep(radius - 0.08, radius, r)) * pow(clamp(r / radius, 0.0, 1.0), 3.0) * 0.5;
    let band = 0.5 + 0.5 * sin((e.x + e.y) * 40.0 + site.time * 4.0);
    let shimmer = pow(band, 6.0) * (1.0 - smoothstep(radius - 0.06, radius, r)) * 0.35;
    let seam = smoothstep(0.0, 0.15, site.progress) * (1.0 - smoothstep(0.85, 1.0, site.progress));
    let glow = clamp(rim + shell + shimmer, 0.0, 1.0) * params.strength * seam * params.colour.a;
    let rgb = mix(image.rgb, mix(params.colour.rgb, vec3<f32>(1.0), rim * 0.5), glow);
    return vec4<f32>(rgb, max(image.a, glow));
}
