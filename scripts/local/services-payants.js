/**
 * Règle du 12 nov. 2026 : aucun service payant dans le générateur vidéo, sauf Claude.
 *
 * installerGarde() remplace fetch et axios dans le processus du générateur : tout appel vers un hôte
 * payant connu (ou vers un hôte qui n'est pas dans la liste autorisée) arrête le générateur avec un
 * message clair au lieu de partir sur le réseau.
 */
const HOTES_PAYANTS = {
  'api.openai.com': 'OpenAI (DALL-E, Whisper API)',
  'api.elevenlabs.io': 'ElevenLabs (voix)',
  'api.deapi.ai': 'deAPI (images)',
  'fal.run': 'fal.ai (images)',
  'queue.fal.run': 'fal.ai (images)',
  'texttospeech.googleapis.com': 'Google Cloud Text-to-Speech',
  'speech.platform.bing.com': 'Edge TTS (service Microsoft en ligne)',
};

// Seuls réseaux encore utilisés par le générateur : Claude, et Telegram pour l'aperçu privé
const HOTES_AUTORISES = ['api.anthropic.com', 'api.telegram.org'];

class ServicePayantBloque extends Error {
  constructor(hote, quoi) {
    super(`Service payant bloqué : ${quoi} (${hote}). Règle du 12 nov. 2026 : seul Claude est autorisé ; `
      + 'voix, sous-titres, images et sons sont produits en local. Générateur arrêté.');
    this.name = 'ServicePayantBloque';
  }
}

function hoteDe(url) {
  try {
    return new URL(String(url)).host.toLowerCase();
  } catch {
    return '';
  }
}

/** Lève ServicePayantBloque si l'URL vise un service payant ou un hôte non autorisé. */
function verifierUrl(url) {
  const hote = hoteDe(url);
  if (!hote || hote.startsWith('localhost') || hote.startsWith('127.0.0.1')) return;
  if (HOTES_PAYANTS[hote]) throw new ServicePayantBloque(hote, HOTES_PAYANTS[hote]);
  if (!HOTES_AUTORISES.includes(hote)) throw new ServicePayantBloque(hote, 'hôte non autorisé dans le générateur');
}

/** À appeler une fois au démarrage du générateur. */
function installerGarde() {
  if (global.__gardeServicesPayants) return;
  global.__gardeServicesPayants = true;
  const fetchOrigine = global.fetch;
  if (fetchOrigine) {
    global.fetch = (entree, ...reste) => {
      verifierUrl(typeof entree === 'string' ? entree : entree && entree.url);
      return fetchOrigine(entree, ...reste);
    };
  }
  try {
    const axios = require('axios');
    const garde = (config) => {
      verifierUrl(config.baseURL ? new URL(config.url, config.baseURL).href : config.url);
      return config;
    };
    axios.interceptors.request.use(garde);
    const creer = axios.create.bind(axios);
    axios.create = (...args) => {
      const instance = creer(...args);
      instance.interceptors.request.use(garde);
      return instance;
    };
  } catch {
    // axios absent : rien à garder
  }
}

/** Pour les fonctions d'anciens modules qui appelaient un service payant. */
function refuser(quoi) {
  throw new ServicePayantBloque('désactivé dans le code', quoi);
}

module.exports = { HOTES_PAYANTS, HOTES_AUTORISES, ServicePayantBloque, verifierUrl, installerGarde, refuser };
