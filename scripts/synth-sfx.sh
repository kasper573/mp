#!/usr/bin/env bash
# Synthesizes the generated sound effects: a bank of 26 letter sounds per voice timbre
# (content/assets/audio/babble/<bank>/a..z.wav), the forest's intro drums, the harbour's ambience,
# interface stings, and a pickup and trade sound per item material. Retune the numbers and rerun.
set -euo pipefail
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
render() { sox -r 22050 -c 1 -n -e floating-point -b 32 "$@"; }

declare -A formants=([a]="730 1090" [e]="530 1840" [i]="270 2290" [o]="570 840" [u]="300 870")
declare -A vowel=(
  [a]=a [b]=i [c]=i [d]=i [e]=e [f]=e [g]=i [h]=a [i]=i [j]=a [k]=a [l]=e [m]=e
  [n]=e [o]=o [p]=i [q]=u [r]=a [s]=e [t]=i [u]=u [v]=i [w]=u [x]=e [y]=a [z]=i
)
declare -A onset=(
  [b]="burst 500 0.010 -14" [d]="burst 2800 0.010 -14" [g]="burst 1600 0.012 -14"
  [p]="burst 600 0.014 -8" [t]="burst 3500 0.014 -8" [k]="burst 1800 0.016 -8"
  [c]="burst 1900 0.016 -8" [q]="burst 1700 0.016 -8"
  [f]="hiss 2600 0.035 -12" [v]="hiss 2200 0.030 -16" [s]="hiss 5000 0.040 -10"
  [z]="hiss 4500 0.035 -14" [x]="hiss 4200 0.040 -10" [h]="hiss 1500 0.030 -16"
  [j]="hiss 2800 0.030 -12"
  [l]="hum 0.025" [m]="hum 0.030" [n]="hum 0.030" [r]="hum 0.025" [w]="hum 0.025" [y]="hum 0.020"
)

bank() {
  local name=$1 sweep=$2 length=$3
  shift 3
  local dir=content/assets/audio/babble/$name
  mkdir -p "$dir"
  for letter in {a..z}; do
    read -r f1 f2 <<<"${formants[${vowel[$letter]}]}"
    render "$work/vowel.wav" synth "$length" sawtooth "$sweep" gain -18 "$@" gain -12 \
      equalizer "$f1" 1.5q 12 equalizer "$f2" 2q 9
    local parts=("$work/vowel.wav")
    if [ -n "${onset[$letter]:-}" ]; then
      read -r kind a b c <<<"${onset[$letter]}"
      case $kind in
        burst) render "$work/onset.wav" synth "$b" whitenoise gain -12 highpass "$a" fade 0 "$b" "$b" gain "$c" ;;
        hiss) render "$work/onset.wav" synth "$b" pinknoise gain -12 bandpass "$a" 1q fade 0.005 "$b" 0.01 gain "$c" ;;
        hum) render "$work/onset.wav" synth "$a" sawtooth "$sweep" gain -18 "$@" gain -12 lowpass 400 fade 0.004 "$a" 0 gain -4 ;;
      esac
      parts=("$work/onset.wav" "$work/vowel.wav")
    fi
    sox "${parts[@]}" -e signed-integer -b 16 "$dir/$letter.wav" fade t 0.004 0 0.025 gain -n -3
  done
}
bank soft 300:270 0.075 lowpass 3200
bank gruff 150:135 0.085 overdrive 8 lowpass 2200

drum() { render "$1" synth 0.9 sine 130:42 overdrive 6 gain -12 fade l 0.002 0.9 0.85 lowpass 500 gain "$2"; }
drum "$work/low.wav" -3
drum "$work/soft.wav" -9
sox -m "$work/low.wav" "|sox $work/soft.wav -p pad 0.32" "|sox $work/low.wav -p pad 0.64" \
  -e signed-integer -b 16 content/assets/audio/interface/forest_drums.wav gain -6 reverb 35 50 70 gain -n -1

mkdir -p content/assets/audio/ambient content/assets/audio/items/pickup content/assets/audio/items/trade
fine() { sox -r 44100 -c 1 -n -e floating-point -b 32 "$@"; }
save() { sox "$1" -e signed-integer -b 16 "$2" "${@:3}" gain -n -3; }
at() { echo "|sox $1 -p pad $2"; }

struck() {
  local file=$1 length=$2
  shift 2
  local parts=() n=0
  for spec in "$@"; do
    IFS=: read -r freq level decay <<<"$spec"
    fine "$work/partial$n.wav" synth "$length" sine "$freq" fade q 0.002 fade l 0 "$decay" "$decay" gain "$level"
    parts+=("$work/partial$n.wav")
    n=$((n + 1))
  done
  if [ ${#parts[@]} -eq 1 ]; then cp "${parts[0]}" "$file"; else sox -m "${parts[@]}" "$file"; fi
}

noise() {
  local file=$1 length=$2 color=$3
  shift 3
  fine "$file" synth "$length" "$color" gain -12 "$@"
}

gull() {
  fine "$1" synth 0.34 sawtooth "$2" gain -18 bend 0,650,.07 0,-1100,.25 \
    bandpass 1900 0.9q equalizer 3200 1q 6 tremolo 34 30 fade q 0.015 0.34 0.12
}
gull "$work/gull1.wav" 900
gull "$work/gull2.wav" 1020
gull "$work/gull3.wav" 860
sox -m "$work/gull1.wav" "$(at "$work/gull2.wav" 0.38)" "$(at "$work/gull3.wav" 0.95)" "$work/gulls.wav"
noise "$work/surf.wav" 1.9 pinknoise lowpass 700 fade q 0.6 1.9 0.9 gain -14
sox -m "$work/gulls.wav" "$work/surf.wav" "$work/gulls_all.wav"
save "$work/gulls_all.wav" "content/assets/audio/ambient/gulls.wav" lowpass 4200 pad 0 0.4 reverb 55 50 90

noise "$work/grind.wav" 1.4 brownnoise bandpass 480 0.6q tremolo 7.3 35 fade q 0.35 1.4 0.6
grains=()
while read -r offset band level; do
  noise "$work/grain$offset.wav" 0.025 whitenoise bandpass "$band" 1.5q fade l 0.002 0.025 0.02 gain "$level"
  grains+=("$(at "$work/grain$offset.wav" "$offset")")
done < <(awk 'function spread(i, step) { return i * step - int(i * step) }
  BEGIN { for (i = 1; i <= 24; i++) printf "%.3f %d %d\n", 0.12 + 1.05 * spread(i, 0.618034), 1600 + 1800 * spread(i, 0.414214), -8 - 10 * spread(i, 0.732051) }')
sox -m "${grains[@]}" "$work/grit.wav" pad 0 0.3 fade q 0.3 1.4 0.5
fine "$work/thud.wav" synth 0.35 sine 78:44 fade l 0 0.35 0.33 gain -2
fine "$work/creak.wav" synth 0.5 sawtooth 120 gain -18 bend 0,300,.28 0,-200,.18 bandpass 700 2q tremolo 18 60 fade q 0.08 0.5 0.2 gain -6
sox -m "$work/grind.wav" "$work/grit.wav" "$(at "$work/creak.wav" 0.3)" "$(at "$work/thud.wav" 1.15)" "$work/hull.wav"
save "$work/hull.wav" "content/assets/audio/ambient/hull_scrape.wav" lowpass 3000 pad 0 0.3 reverb 30 50 60

note() { struck "$1" 0.9 "$2:0:0.85" "$(awk "BEGIN{print $2*2}"):-12:0.4" "$(awk "BEGIN{print $2*3}"):-20:0.2"; }
note "$work/c.wav" 1047
note "$work/e.wav" 1319
note "$work/g.wav" 1568
note "$work/c2.wav" 2093
sox -m "$work/c.wav" "$(at "$work/e.wav" 0.07)" "$(at "$work/g.wav" 0.14)" "$(at "$work/c2.wav" 0.21)" "$work/rise.wav"
save "$work/rise.wav" "content/assets/audio/interface/rising_chime.wav" pad 0 0.3 reverb 40 50 80

struck "$work/tick_body.wav" 0.08 "1150:0:0.05" "3100:-9:0.025"
noise "$work/tick_click.wav" 0.006 whitenoise highpass 2500 fade l 0 0.006 0.006 gain -6
sox -m "$work/tick_body.wav" "$work/tick_click.wav" "$work/tick.wav"
save "$work/tick.wav" "content/assets/audio/interface/tally_tick.wav" lowpass 5000

clink() { struck "$1" 0.2 "$2:0:0.16" "$(awk "BEGIN{print $2*1.47}"):-5:0.12" "$(awk "BEGIN{print $2*2.18}"):-9:0.08"; }
clink "$work/coin1.wav" 3100
clink "$work/coin2.wav" 3600
clink "$work/coin3.wav" 2850
clink "$work/coin4.wav" 3350
sox -m "$work/coin1.wav" "$(at "$work/coin2.wav" 0.055)" "$work/coins_pickup.wav"
save "$work/coins_pickup.wav" "content/assets/audio/items/pickup/coins.wav" lowpass 9000
sox -m "$work/coin1.wav" "$(at "$work/coin3.wav" 0.04)" "$(at "$work/coin2.wav" 0.09)" "$(at "$work/coin4.wav" 0.13)" "$(at "$work/coin1.wav" 0.2)" "$work/coins_trade.wav"
save "$work/coins_trade.wav" "content/assets/audio/items/trade/coins.wav" lowpass 9000 reverb 15

struck "$work/glass1.wav" 0.4 "2450:0:0.34" "5900:-8:0.2" "8100:-16:0.08"
struck "$work/glass2.wav" 0.4 "2780:0:0.3" "6400:-9:0.18"
noise "$work/slosh.wav" 0.25 pinknoise bandpass 900 1q tremolo 9 80 fade q 0.05 0.25 0.12 gain -18
sox -m "$work/glass1.wav" "$work/slosh.wav" "$work/glass_pickup.wav"
save "$work/glass_pickup.wav" "content/assets/audio/items/pickup/glass.wav"
sox -m "$work/glass1.wav" "$(at "$work/glass2.wav" 0.08)" "$work/slosh.wav" "$work/glass_trade.wav"
save "$work/glass_trade.wav" "content/assets/audio/items/trade/glass.wav" reverb 15

clack() {
  noise "$work/clack_noise.wav" 0.04 whitenoise bandpass "$2" 2q fade l 0 0.04 0.04
  struck "$work/clack_tone.wav" 0.05 "$(awk "BEGIN{print $2*0.6}"):-4:0.03"
  sox -m "$work/clack_noise.wav" "$work/clack_tone.wav" "$1"
}
clack "$work/bone1.wav" 1500
clack "$work/bone2.wav" 1250
save "$work/bone1.wav" "content/assets/audio/items/pickup/bone.wav" lowpass 6000
sox -m "$work/bone1.wav" "$(at "$work/bone2.wav" 0.075)" "$work/bone_trade.wav"
save "$work/bone_trade.wav" "content/assets/audio/items/trade/bone.wav" lowpass 6000

noise "$work/flop.wav" 0.12 brownnoise lowpass 650 fade l 0.004 0.12 0.11
noise "$work/slap.wav" 0.03 whitenoise bandpass 1300 1q fade l 0 0.03 0.03 gain -8
sox -m "$work/flop.wav" "$work/slap.wav" "$work/flesh1.wav"
save "$work/flesh1.wav" "content/assets/audio/items/pickup/flesh.wav"
sox -m "$work/flesh1.wav" "$(at "$work/flop.wav" 0.09)" "$work/flesh_trade.wav"
save "$work/flesh_trade.wav" "content/assets/audio/items/trade/flesh.wav"

struck "$work/ring_short.wav" 0.3 "1820:0:0.24" "2760:-4:0.18" "4130:-8:0.12" "5790:-12:0.08"
save "$work/ring_short.wav" "content/assets/audio/items/pickup/blade.wav" lowpass 4500
struck "$work/ring_long.wav" 0.8 "1820:0:0.7" "2760:-4:0.5" "4130:-7:0.35" "5790:-10:0.22"
noise "$work/shing.wav" 0.18 whitenoise highpass 3200 fade q 0.12 0.18 0.06 gain -6
sox -m "$work/shing.wav" "$(at "$work/ring_long.wav" 0.12)" "$work/blade_trade.wav"
save "$work/blade_trade.wav" "content/assets/audio/items/trade/blade.wav" reverb 15

ping() { struck "$1" 0.12 "$2:0:0.09" "$(awk "BEGIN{print $2*1.62}"):-7:0.05"; }
ping "$work/ping1.wav" 4200
ping "$work/ping2.wav" 5100
ping "$work/ping3.wav" 3700
save "$work/ping1.wav" "content/assets/audio/items/pickup/trinket.wav"
sox -m "$work/ping1.wav" "$(at "$work/ping2.wav" 0.05)" "$(at "$work/ping3.wav" 0.11)" "$work/trinket_trade.wav"
save "$work/trinket_trade.wav" "content/assets/audio/items/trade/trinket.wav"

noise "$work/rustle.wav" 0.18 whitenoise bandpass 3800 0.8q tremolo 27 85 fade q 0.03 0.18 0.1
save "$work/rustle.wav" "content/assets/audio/items/pickup/paper.wav"
noise "$work/fold1.wav" 0.2 whitenoise bandpass 3400 0.8q tremolo 23 85 fade q 0.04 0.2 0.1
noise "$work/fold2.wav" 0.16 whitenoise bandpass 4200 0.8q tremolo 31 85 fade q 0.02 0.16 0.1
sox -m "$work/fold1.wav" "$(at "$work/fold2.wav" 0.17)" "$work/paper_trade.wav"
save "$work/paper_trade.wav" "content/assets/audio/items/trade/paper.wav"

fine "$work/knock_tone.wav" synth 0.1 sine 170:120 fade l 0 0.1 0.1
noise "$work/knock_noise.wav" 0.05 brownnoise bandpass 420 1q fade l 0 0.05 0.05
sox -m "$work/knock_tone.wav" "$work/knock_noise.wav" "$work/knock.wav"
save "$work/knock.wav" "content/assets/audio/items/pickup/stone.wav"
noise "$work/scrape.wav" 0.16 brownnoise bandpass 650 1q tremolo 21 70 fade q 0.03 0.16 0.08 gain -4
sox -m "$work/knock.wav" "$(at "$work/scrape.wav" 0.07)" "$work/stone_trade.wav"
save "$work/stone_trade.wav" "content/assets/audio/items/trade/stone.wav"
