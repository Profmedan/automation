#!/usr/bin/env python3
"""Recherche locale en lecture seule ; aucun réseau, aucune exécution des recettes."""
import argparse, json
from pathlib import Path
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('query', nargs='?', default='')
p.add_argument('--category')
p.add_argument('--id')
p.add_argument('--limit', type=int, default=8)
args = p.parse_args()
root = Path(__file__).resolve().parents[1]
items = json.loads((root/'references/recipes-index.json').read_text())
tokens = args.query.casefold().split()
hits = []
for r in items:
    if args.id and r['id'] != args.id: continue
    if r.get('parse_error') and not args.id: continue
    if args.category and r.get('category') != args.category: continue
    hay = json.dumps(r, ensure_ascii=False).casefold()
    if tokens and not all(t in hay for t in tokens): continue
    hits.append({**r, 'manifest_path': str(root/r['manifest'])})
print(json.dumps(hits[:max(1, min(50, args.limit))], ensure_ascii=False, indent=2))
