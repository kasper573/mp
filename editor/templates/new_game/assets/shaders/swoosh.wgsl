// A sweep of light crossing the site: a bright crescent band that runs across the area over the
// layer's duration, trailing a fading wake. On a cone it wipes from one edge to the other like a
// blade; on any other shape, or on an actor, it runs straight across, bowed by `curve`.
//   colour     the band's colour; its alpha scales the whole sweep
//   thickness  the band's width, as a fraction of the sweep's span
//   sweeps     how many times it crosses during the layer
//   along      0 runs across the facing, 1 runs along it
//   angle      degrees the sweep turns on a site without an area, such as an actor
//   curve      how far the band bows into a crescent, as a fraction of the span
//   trail      how long the wake lingers behind the band, as a fraction of the span
//   clip       on a sprite, how much the sweep keeps to its pixels: 0 crosses the air around it too
fn vfx(uv: vec2<f32>) -> vec4<f32> {
    let suv = site_uv(uv);
    let image = sample(suv);
    let p = area_local(suv);
    let phase = fract(site.progress * max(params.sweeps, 0.01));
    var sweep = 0.0;
    var span = 1.0;
    var across = 0.0;
    var inside = 1.0;
    if site.shape == SHAPE_CONE && params.along < 0.5 {
        let half = site.extent.x * 0.5;
        span = 2.0 * half;
        sweep = atan2(p.y, p.x) + half;
        across = clamp(length(p) / max(site.extent.y, 0.01), 0.0, 1.0);
        inside = 1.0 - smoothstep(-0.08, 0.04, area_distance(suv));
        sweep = sweep + params.curve * span * 0.5 * (1.0 - across);
    } else if site.shape != SHAPE_NONE {
        let bounds = extent_along();
        let lo = select(bounds.z, bounds.x, params.along < 0.5);
        let hi = select(bounds.w, bounds.y, params.along < 0.5);
        span = hi - lo;
        let main = select(p.x, p.y, params.along < 0.5);
        let other = select(p.y, p.x, params.along < 0.5);
        let other_span = select(bounds.y - bounds.x, bounds.w - bounds.z, params.along < 0.5);
        across = clamp(other / max(other_span * 0.5, 0.01), -1.0, 1.0);
        sweep = main - lo + params.curve * span * 0.5 * (1.0 - across * across);
        inside = 1.0 - smoothstep(-0.08, 0.04, area_distance(suv));
    } else {
        let a = radians(params.angle);
        let heading = vec2<f32>(cos(a), sin(a));
        let centred = suv - 0.5;
        let main = dot(centred, heading);
        let other = dot(centred, vec2<f32>(-heading.y, heading.x));
        span = 1.2;
        across = clamp(other * 2.0, -1.0, 1.0);
        sweep = main + 0.6 + params.curve * 0.5 * (1.0 - across * across);
        let box = f32(all(abs(centred) < vec2<f32>(0.75)));
        inside = box * mix(1.0, image.a, clamp(params.clip, 0.0, 1.0));
    }
    let head = span * phase;
    let band = max(params.thickness * span, 0.001);
    let ahead = sweep - head;
    let edge = 1.0 - smoothstep(0.0, band, abs(ahead));
    let wake = select(0.0, exp(-(-ahead) / max(params.trail * span, 0.001)) * 0.45, ahead < 0.0);
    let settling = 1.0 - smoothstep(0.6, 1.0, site.progress);
    let glow = (edge + wake) * inside * settling * params.colour.a;
    let streak = vec4<f32>(params.colour.rgb, glow);
    return vec4<f32>(mix(image.rgb, streak.rgb, streak.a), max(image.a, streak.a));
}

// The footprint's reach from its point in local tiles: along the facing (x: min, y: max) and across
// it (z: min, w: max).
fn extent_along() -> vec4<f32> {
    switch site.shape {
        case 1u: {
            let r = site.extent.x;
            return vec4<f32>(-r, r, -r, r);
        }
        case 2u: {
            let half = site.extent * 0.5;
            return vec4<f32>(-half.x, half.x, -half.y, half.y);
        }
        case 3u: {
            let reach = site.extent.y;
            let wide = reach * sin(min(site.extent.x * 0.5, 1.5707964));
            return vec4<f32>(0.0, reach, -wide, wide);
        }
        case 4u: {
            let half = site.extent.y * 0.5;
            return vec4<f32>(0.0, site.extent.x, -half, half);
        }
        default: {
            return vec4<f32>(-0.5, 0.5, -0.5, 0.5);
        }
    }
}
