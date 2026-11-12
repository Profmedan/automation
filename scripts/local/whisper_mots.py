# Mots horodatés de chaque WAV (Whisper medium, hors réseau, dans l'image Docker chatterbox-fr).
#   python whisper_mots.py sortie.json a.wav b.wav ...
# Sortie : {"a.wav": {"texte": "...", "mots": [{"mot": "...", "debut": 0.0, "fin": 0.3}, ...]}, ...}
import json, sys, time
import numpy as np, soundfile as sf, torch
from transformers import pipeline

torch.set_num_threads(4)
t0 = time.time()
asr = pipeline("automatic-speech-recognition", model="/modeles/whisper-medium", device="cpu")
sortie, fichiers = sys.argv[1], sys.argv[2:]
res = {}
for f in fichiers:
    x, sr = sf.read(f, dtype="float32")
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != 16000:
        import scipy.signal as ss
        x = ss.resample_poly(x, 16000, sr).astype(np.float32)
        sr = 16000
    t1 = time.time()
    r = asr({"raw": x, "sampling_rate": sr}, return_timestamps="word", batch_size=1,
            generate_kwargs={"language": "fr", "task": "transcribe"})
    mots = [{"mot": c["text"].strip(), "debut": c["timestamp"][0], "fin": c["timestamp"][1]} for c in r["chunks"]]
    res[f.split("/")[-1]] = {"texte": r["text"].strip(), "mots": mots, "calcul_s": round(time.time() - t1, 1), "duree_s": round(len(x) / sr, 2)}
    print(f, res[f.split("/")[-1]]["calcul_s"], "s", flush=True)
json.dump(res, open(sortie, "w"), ensure_ascii=False, indent=1)
print("chargement + total", round(time.time() - t0, 1), "s")
