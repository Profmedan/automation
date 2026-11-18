"""Contrôle local du MP4 final ; aucune API distante, aucune clé, aucune téléversement."""
from pathlib import Path
import sys
from earshot import api
from earshot.report import to_json

video=sys.argv[1]
out=Path('/output')
measures=api.measure(video)
(out/'measure.json').write_text(to_json(measures),encoding='utf-8')
print('Mesures audio terminées',flush=True)
tl=api.timeline(video,cues=str(out/'cues.json'),detail='low')
(out/'timeline.json').write_text(to_json(tl),encoding='utf-8')
print('Écoute Earshot et synchronisation terminées',flush=True)
critique=api.critique(video)
(out/'critique.json').write_text(to_json(critique),encoding='utf-8')
api.sheet(video,str(out/'sheet.png'),cues=str(out/'cues.json'),detail='low',tl=tl)
print(to_json({'measure':measures,'critique':{k:critique.get(k) for k in ['verdict','score','critical_issues','major_issues']}}),flush=True)
