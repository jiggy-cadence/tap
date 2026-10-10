#!/usr/bin/env bash
# Rebuild docs/demo.gif from storyboard beats + SEAL/suite/title-card art.
# Requires: google-chrome, ffmpeg. DEMO ONLY — simulated stone.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOC="$ROOT/docs"
FRAMES="$DOC/demo-frames"
ASSETS="$DOC/assets"
mkdir -p "$FRAMES" "$ASSETS"

# Refresh scaled art if source stills exist
if [[ -f /workspace/aperture/art/seal/seal-devnet-approved.png ]]; then
  for pair in \
    "/workspace/aperture/art/seal/seal-devnet-approved.png|$ASSETS/seal-approved.png" \
    "/workspace/aperture/art/seal/seal-devnet-refused.png|$ASSETS/seal-refused.png" \
    "/workspace/aperture/art/suite/approved-9.5.png|$ASSETS/suite-approved.png"; do
    src="${pair%%|*}"; dst="${pair##*|}"
    [[ -f "$src" ]] || continue
    ffmpeg -y -i "$src" -vf "scale=720:405:force_original_aspect_ratio=decrease,pad=720:405:(ow-iw)/2:(oh-ih)/2:color=0x030504" "$dst" 2>/dev/null
  done
fi
for i in 1 2 3; do
  ffmpeg -y -i "$ROOT/page/title-cards/card$i.png" -vf "scale=720:405:force_original_aspect_ratio=decrease,pad=720:405:(ow-iw)/2:(oh-ih)/2:color=0x0a0907" "$ASSETS/card$i.png" 2>/dev/null
done

HTML="file://$DOC/demo-storyboard.html"
for beat in card1 small drain sealR card2 tap seal suite card3; do
  google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --window-size=720,405 --virtual-time-budget=2000 \
    --screenshot="$FRAMES/$beat.png" "${HTML}?beat=${beat}" 2>/dev/null
done

LIST=$(mktemp)
cat > "$LIST" <<LIST
file '$FRAMES/card1.png'
duration 2.5
file '$FRAMES/small.png'
duration 3.5
file '$FRAMES/drain.png'
duration 4.5
file '$FRAMES/sealR.png'
duration 2.5
file '$FRAMES/card2.png'
duration 2.5
file '$FRAMES/tap.png'
duration 3.5
file '$FRAMES/seal.png'
duration 4.0
file '$FRAMES/suite.png'
duration 3.5
file '$FRAMES/card3.png'
duration 2.5
file '$FRAMES/card3.png'
LIST

PAL=$(mktemp --suffix=.png)
ffmpeg -y -f concat -safe 0 -i "$LIST" -vf "fps=10,scale=540:-1:flags=lanczos" -pix_fmt yuv420p /tmp/tap-demo.mp4 2>/dev/null
ffmpeg -y -i /tmp/tap-demo.mp4 -vf "fps=10,scale=540:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" "$PAL" 2>/dev/null
ffmpeg -y -i /tmp/tap-demo.mp4 -i "$PAL" \
  -lavfi "fps=10,scale=540:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
  "$DOC/demo.gif" 2>/dev/null
rm -f "$LIST" "$PAL"
ls -la "$DOC/demo.gif"
