#!/usr/bin/env python3
"""Kit local déterministe à partir de claude-motion (MIT), sans dépendance ni réseau."""
import argparse
import math
from pathlib import Path
import random
import struct
import wave
import sys
sys.dont_write_bytecode = True
import synth


def generate(destination):
    random.seed(20261114)
    sounds = {'whoosh.wav': synth.whoosh(0.28, 450, 2200),
              'pop.wav': synth.pop(700, 350, dur=0.14),
              'impact.wav': synth.impact(dur=0.65)}
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    for name, samples in sounds.items():
        if not samples or not all(math.isfinite(x) for x in samples):
            raise ValueError(f'Signal invalide : {name}')
        peak = max(abs(x) for x in samples)
        gain = 0.45 / peak if peak else 0
        # Fondu de 3 ms aux deux extrémités ; pas de clic à la coupe.
        edge = int(synth.SR * 0.003)
        pcm = [int(max(-1, min(1, x * gain * min(1, i / edge, (len(samples)-1-i) / edge))) * 32767)
               for i, x in enumerate(samples)]
        with wave.open(str(destination / name), 'wb') as out:
            out.setparams((1, 2, synth.SR, len(pcm), 'NONE', 'not compressed'))
            out.writeframes(struct.pack('<' + 'h' * len(pcm), *pcm))
    return list(sounds)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    print('\n'.join(generate(args.destination)))
