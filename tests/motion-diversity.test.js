const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { RECETTES, choisirMotions } = require('../scripts/local/motion-recipes');
const { htmlScene } = require('../scripts/local/scenes-visuelles');
const { planMotion } = require('../scripts/local/motion-skills');

const exemples = {
  titre: { type: 'titre' },
  compteur: { type: 'compteur', valeur: 42, sur: 100, unite: '%', libelle: 'Part des essais réussis' },
  barres: { type: 'barres', unite: '%', donnees: [{ libelle: 'Avant', valeur: 27 }, { libelle: 'Après', valeur: 87.7 }] },
  comparaison: { type: 'comparaison', gauche: { titre: 'Avant', texte: 'Chaque note est écrite manuellement' }, droite: { titre: 'Après', texte: 'La transcription aide les participants' } },
  etapes: { type: 'etapes', etapes: ['Observer le résultat', 'Vérifier les sources', 'Partager les conclusions'] },
  citation: { type: 'citation', texte: 'La preuve précède la conclusion.', auteur: 'Auteur du témoin' },
};
const scene = type => ({ planRef: 'developpement.1', text: 'Une idée devient visible', source: 'Source du témoin', visuel: exemples[type] });

test('diversité : au moins douze designs exécutables, deux par forme de contenu', () => {
  assert.ok(RECETTES.length >= 12);
  for (const type of Object.keys(exemples)) assert.ok(RECETTES.filter(r => r.type === type).length >= 2, type);
  assert.equal(new Set(RECETTES.map(r => r.id)).size, RECETTES.length);
});

test('choix automatique : le contenu gouverne l’éligibilité et la répétition est évitée sans hasard', () => {
  const scenes = Array.from({ length: 6 }, (_, i) => ({ ...scene('etapes'), text: `Processus vérifié ${i}` }));
  const windows = scenes.map((_, i) => ({ debut: i * 4, duree: 4 }));
  const a = choisirMotions(scenes, windows, 'Un article');
  assert.deepEqual(a, choisirMotions(scenes, windows, 'Un article'));
  assert.ok(new Set(a.map(r => r.design)).size >= 2);
  a.forEach((r, i) => { if (i) assert.notEqual(r.design, a[i-1].design); });
  const unbounded = { ...scene('compteur'), visuel: { type: 'compteur', valeur: 300, libelle: 'Cas observés' }, motion: { recette: 'radial-gauge' } };
  assert.notEqual(choisirMotions([unbounded], [{ duree: 4, debut: 0 }])[0].design, 'radial-gauge');
  const signed = { ...scene('barres'), visuel: { type: 'barres', donnees: [{ libelle: 'Baisse', valeur: -12 }, { libelle: 'Hausse', valeur: 8 }] } };
  assert.notEqual(choisirMotions([signed], [{ duree: 4, debut: 0 }])[0].design, 'column-rise');
  const forged = { ...scene('titre'), motion: { recette: '</script><script>alert(1)</script>' } };
  assert.ok(RECETTES.some(r => r.id === choisirMotions([forged], [{ duree: 4, debut: 0 }])[0].design));
  const short = choisirMotions([scene('etapes')], [{ duree: 0.8, debut: 0 }])[0];
  assert.equal(short.design, 'static');
  const html = htmlScene(scene('etapes'), { id:'s0', duree:0.8, debut:0, mots:[], nbSousIdees:2, premier:true, motion:short });
  assert.doesNotMatch(html, /tl\.(fromTo|to|set)\(/);
  const variantes = new Set(Array.from({length:12}, (_, i) => choisirMotions([scene('titre')], [{duree:4,debut:0}], `Sujet ${i}`)[0].design));
  assert.equal(variantes.size, 2, 'des sujets différents peuvent retenir des compositions différentes');
});

test('chaque design produit une composition distincte et une timeline bornée avec données exactes', () => {
  const signatures = new Set();
  for (const r of RECETTES) {
    const s = { ...scene(r.type), motion: { recette: r.id } };
    const p = planMotion({ title: 'Témoin', scenes: [s] }, [{ debut: 0, duree: 4 }]);
    assert.equal(p.scenes[0].design, r.id);
    const html = htmlScene(s, { id: 's0', duree: 4, debut: 0, mots: [], nbSousIdees: 2, motion: p.scenes[0] });
    signatures.add(html.match(/<!-- design: ([\w-]+) -->/)?.[1]);
    assert.doesNotMatch(html, /NaN|Infinity|requestAnimationFrame|setInterval/);
    const calls = [];
    const timeline = {};
    for (const m of ['fromTo', 'to', 'set']) timeline[m] = (...args) => { calls.push([m, ...args]); return timeline; };
    const doc = { getElementById: () => ({ textContent: '' }), querySelectorAll: () => [] };
    const context = { gsap: { timeline: () => timeline }, window: {}, document: doc };
    vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
    assert.equal(context.window.__timelines.s0, timeline);
    for (const [m, target, from, to, start] of calls) {
      const vars = m === 'fromTo' ? to : from;
      const t = m === 'fromTo' ? start : to;
      assert.ok(Number.isFinite(t) && t >= 0, `${r.id} ${target} début ${t}`);
      assert.ok(t + (vars.duration || 0) + (vars.stagger || 0) * 5 <= 4.001, `${r.id} ${target} hors scène`);
    }
    if (r.type === 'compteur') assert.match(html, />42</);
    if (r.id === 'radial-gauge') {
      const arc = calls.find(x => x[1] === '#s0-arc');
      assert.ok(Math.abs((arc[2].strokeDashoffset - arc[3].strokeDashoffset) / arc[2].strokeDashoffset - 0.42) < 1e-9);
    }
    if (r.type === 'barres') { assert.match(html, /87,7/); assert.match(html, /27/); }
  }
  assert.equal(signatures.size, RECETTES.length);
});

module.exports = { exemples };
