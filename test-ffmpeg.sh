#!/bin/bash

# Test FFmpeg installation

echo "🔍 Test FFmpeg..."

# Vérifier la présence
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg non trouvé dans PATH"
    exit 1
fi

echo "✅ FFmpeg trouvé: $(which ffmpeg)"

# Version
echo ""
echo "📦 Version:"
ffmpeg -version | head -1

# Test simple : créer une vidéo de test
echo ""
echo "🎬 Test génération vidéo simple..."

# Créer une vidéo de 3 secondes avec fond noir
ffmpeg -f lavfi -i color=black:s=1080x1080:d=3 \
  -vf "drawtext=text='Test FFmpeg':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2" \
  -y /tmp/test-ffmpeg.mp4 \
  -loglevel quiet

if [ -f /tmp/test-ffmpeg.mp4 ]; then
    SIZE=$(ls -lh /tmp/test-ffmpeg.mp4 | awk '{print $5}')
    echo "✅ Vidéo test générée: /tmp/test-ffmpeg.mp4 ($SIZE)"
    rm /tmp/test-ffmpeg.mp4
else
    echo "❌ Échec génération test"
    exit 1
fi

echo ""
echo "🎉 FFmpeg opérationnel !"
