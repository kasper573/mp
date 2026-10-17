// The ground a skill is aimed at: a translucent sheet of magic in the shape of the area, ripples
// drifting across it, rings rolling out from its point and a rim that glows at its edge. hostile
// is 1 for a skill that harms, which trades the calm colours for the hostile ones.
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let distance = area_distance(uv);
    let inside = 1.0 - smoothstep(-0.05, 0.03, distance);
    let local = area_local(uv);
    let t = site.time;
    let colour = mix(params.colour, params.hostile_colour, params.hostile);
    let rim_colour = mix(params.rim, params.hostile_rim, params.hostile);
    let drift = sin(local.x * 6.0 + t * 1.7) * sin(local.y * 5.0 - t * 1.3 + sin(t * 0.6) * 1.5);
    let sheen = 0.5 + 0.5 * drift;
    let radius = length(local);
    let rings = pow(0.5 + 0.5 * sin(radius * 5.5 - t * 3.0), 8.0);
    let rim = smoothstep(-0.45, 0.0, distance);
    let pulse = 0.85 + 0.15 * sin(t * 3.5);
    let body = colour.a * (0.10 + 0.08 * sheen + 0.18 * rings * (1.0 - rim * 0.5));
    let edge = rim_colour.a * rim * rim * pulse * 0.85;
    let rgb = mix(colour.rgb, rim_colour.rgb, rim * rim + 0.5 * rings);
    return vec4<f32>(rgb, (body + edge) * inside * params.strength);
}
