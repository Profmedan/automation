#!/usr/bin/env node
// Renouvelle FACEBOOK_PAGE_TOKEN dans .env (2026-10-22).
// Usage : copie le jeton UTILISATEUR longue durée (60 jours) dans le
// presse-papiers, puis lance `node maj-jeton-facebook.mjs`.
// Le script lit le presse-papiers (pbpaste), demande à Facebook le jeton de
// la Page FACEBOOK_PAGE_ID (un jeton de Page obtenu ainsi n'expire pas), et
// l'écrit dans .env. Aucun jeton n'est affiché.
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';

const ENV = new URL('./.env', import.meta.url).pathname;
const VERSION = 'v26.0';
const texte = readFileSync(ENV, 'utf8');
const pageId = (texte.match(/^FACEBOOK_PAGE_ID=(.*)$/m) || [])[1]?.trim();
if (!pageId) { console.error('❌ FACEBOOK_PAGE_ID absent du .env'); process.exit(1); }

const jetonUtilisateur = execSync('pbpaste').toString().trim();
if (!/^EA[A-Za-z0-9]+$/.test(jetonUtilisateur)) {
  console.error('❌ Le presse-papiers ne contient pas un jeton Facebook (il doit commencer par « EA »).');
  process.exit(1);
}

const rep = await fetch(`https://graph.facebook.com/${VERSION}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(jetonUtilisateur)}`);
const data = await rep.json();
if (data.error) { console.error('❌ Facebook :', data.error.message); process.exit(1); }
const page = (data.data || []).find((p) => p.id === pageId);
if (!page) {
  console.error(`❌ La Page ${pageId} n'est pas dans les Pages de ce compte. Pages trouvées : ${(data.data || []).map((p) => p.name).join(', ') || 'aucune'}`);
  process.exit(1);
}

// Vérification : le nouveau jeton de Page permet bien de lire la Page.
const test = await (await fetch(`https://graph.facebook.com/${VERSION}/${pageId}?fields=name&access_token=${encodeURIComponent(page.access_token)}`)).json();
if (test.error) { console.error('❌ Jeton de Page refusé :', test.error.message); process.exit(1); }

const sauvegarde = `${ENV}.bak-${new Date().toISOString().slice(0, 10)}`;
copyFileSync(ENV, sauvegarde);
writeFileSync(ENV, texte.replace(/^FACEBOOK_PAGE_TOKEN=.*$/m, `FACEBOOK_PAGE_TOKEN=${page.access_token}`));
execSync('pbcopy', { input: '' }); // vide le presse-papiers
console.log(`✅ Jeton de la Page « ${test.name} » mis à jour dans .env (sauvegarde : ${sauvegarde.split('/').pop()}).`);
console.log('   Presse-papiers vidé.');
