"""Génère les clips vocaux d'Élan avec Piper (voix française), sans intervention manuelle.

Entrée : tools/clips/texts.json. Sortie : audio/clips/<id>.mp3 et audio/clips/manifest.json.
Chaque clip : silences de début et de fin retirés, volume normalisé (-16 LUFS), mono 22,05 kHz, MP3 48 kb/s.
"""
import hashlib, json, pathlib, subprocess, urllib.request, wave
from importlib.metadata import version
from piper import PiperVoice

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = json.loads((ROOT / "tools/clips/texts.json").read_text(encoding="utf-8"))
OUT = ROOT / "audio/clips"
CACHE = ROOT / ".cache/voice"
OUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)

name, base = SRC["voice"]["name"], SRC["voice"]["base"]
model = CACHE / f"{name}.onnx"
for f in (f"{name}.onnx", f"{name}.onnx.json"):
    if not (CACHE / f).exists():
        urllib.request.urlretrieve(base + f, CACHE / f)
voice = PiperVoice.load(str(model))

manifest = {
    "format": "elan-clips", "version": 1,
    "voice": name, "voiceUrl": base,
    "modelSha256": hashlib.sha256(model.read_bytes()).hexdigest(),
    "generator": f"piper-tts {version('piper-tts')}",
    "license": "Voir CREDITS.md",
    "clips": {},
}
for cid, spec in SRC["clips"].items():
    wav = CACHE / f"{cid}.wav"
    with wave.open(str(wav), "wb") as w:
        voice.synthesize_wav(spec["text"], w)
    trim = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,"
            "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse")
    tempo = spec.get("tempo")
    af = trim + (f",atempo={tempo}" if tempo else "") + ",loudnorm=I=-16:TP=-1.5:LRA=7"
    mp3 = OUT / f"{cid}.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", af,
                    "-ar", "22050", "-ac", "1", "-b:a", "48k", str(mp3)], check=True)
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
                         capture_output=True, text=True, check=True).stdout.strip()
    manifest["clips"][cid] = {"text": spec["text"], "file": f"{cid}.mp3", "durationS": round(float(dur), 2)}
    print(cid, spec["text"], dur)

(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{len(manifest['clips'])} clips générés dans {OUT}")
