const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const CONFIG = require('../scripts/local/config-locale');
const whisper = require('../scripts/local/whisper-local');
const transcription = whisper.transcrireMots;
// La reconnaissance est simulée ; le changement de tempo et la mesure WAV utilisent vraiment FFmpeg.
whisper.transcrireMots = () => [{mot:'ChatGPT',debut:0,fin:.5},{mot:'et',debut:.5,fin:.8},{mot:'l’IA.',debut:.8,fin:1.7}];
const {texteDit,genererVoixLocale} = require('../scripts/local/voix-locale');
whisper.transcrireMots = transcription;

test('ChatGPT est lu tchat gépété, IA et l’IA sont épelées, les textes écrits restent intacts',()=>{
  const texte='ChatGPT, chatgpt, CHATGPT et ChatGPT-5 utilisent l’IA. Une IA. L\'IA. Vive l’IA.';
  assert.equal(texteDit(texte),"tchat gépété, tchat gépété, tchat gépété et tchat gépété-5 utilisent l'i-a. Une i-a. L'i-a. Vive l'i-a.");
  assert.equal(texteDit('VIA, médiation et monChatGPT ne sont pas ces mots.'),'VIA, médiation et monChatGPT ne sont pas ces mots.');
  assert.match(texte,/ChatGPT/);
});

test('la voix réellement assemblée est accélérée de 10 % et les sous-titres gardent ChatGPT et IA',async()=>{
  assert.equal(CONFIG.CHATTERBOX.tempo,1.10);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voix-regles-'));
  try {
    const src=path.join(dir,'prises');fs.mkdirSync(src);
    execFileSync(CONFIG.FFMPEG,['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=2','-ar','24000','-ac','1',path.join(src,'s0.wav')]);
    let recus;
    const r=await genererVoixLocale([{id:'s0',narration:'ChatGPT et l’IA.'}],dir,{prises:items=>{recus=items;return {dossier:src,secondes:0,moteur:'Essai local'};}});
    assert.equal(recus[0].text,"tchat gépété et l'i-a.");
    const mesure=Number(execFileSync(CONFIG.FFPROBE,['-v','error','-show_entries','format=duration','-of','csv=p=0',path.join(dir,'voix/s0.wav')]).toString());
    assert.ok(Math.abs(mesure-2/1.1)<.05,`durée après accélération : ${mesure}`);
    assert.deepEqual(r.scenes[0].mots.map(m=>m.mot),['ChatGPT','et','l’IA.']);
    assert.equal(r.tempo,1.1);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

 test('OpenAI est épelé Open-A-I, quelles que soient la casse et la ponctuation',()=>{
  const original='OpenAI, openai et OPENAI : ChatGPT et l’IA.';
  assert.equal(texteDit(original),"Open-A-I, Open-A-I et Open-A-I : tchat gépété et l'i-a.");
  assert.equal(texteDit('monOpenAI et OpenAIR restent écrits.'),'monOpenAI et OpenAIR restent écrits.');
  assert.equal(original,'OpenAI, openai et OPENAI : ChatGPT et l’IA.');
 });
