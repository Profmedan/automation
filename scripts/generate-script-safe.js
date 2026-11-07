#!/usr/bin/env node

/**
 * Wrapper SÛRE pour generateVideoScript avec vrai timeout (120s)
 * Tue le processus si dépassement
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function generateVideoScriptWithKill(article, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    // Crée un fichier temp pour l'article
    const tempDir = path.join(__dirname, '..', '.tmp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    
    const articleFile = path.join(tempDir, `article-${Date.now()}.json`);
    fs.writeFileSync(articleFile, JSON.stringify(article));
    
    console.log('⏱️  Génération script (timeout: 120s)...');
    const startTime = Date.now();
    
    // Lance le subprocess
    const proc = spawn('node', ['-e', `
      const { generateVideoScript } = require('./generate-script-dynamic');
      const article = ${JSON.stringify(article)};
      generateVideoScript(article).then(script => {
        console.log('__SCRIPT_JSON__' + JSON.stringify(script) + '__END__');
        process.exit(0);
      }).catch(error => {
        console.error('❌ Script error:', error.message);
        process.exit(1);
      });
    `], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs
    });
    
    let output = '';
    let errorOutput = '';
    
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text); // Log en temps réel
      output += text;
    });
    
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      process.stderr.write(text);
      errorOutput += text;
    });
    
    // Timer pour vraiment tuer le process
    const killTimer = setTimeout(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      console.error(`\n⏲️  TIMEOUT après ${elapsed.toFixed(1)}s - TUE le processus`);
      try {
        proc.kill('SIGKILL');
      } catch (e) {}
      reject(new Error(`OpenAI timeout après ${elapsed.toFixed(1)}s`));
    }, timeoutMs);
    
    proc.on('close', (code) => {
      clearTimeout(killTimer);
      const elapsed = (Date.now() - startTime) / 1000;
      
      // Cleanup
      try { fs.unlinkSync(articleFile); } catch (e) {}
      
      if (code !== 0) {
        reject(new Error(`Script failed (code ${code}): ${errorOutput}`));
        return;
      }
      
      // Extract JSON from output
      const match = output.match(/__SCRIPT_JSON__(.*?)__END__/s);
      if (!match) {
        reject(new Error('No JSON output from script'));
        return;
      }
      
      try {
        const script = JSON.parse(match[1]);
        console.log(`✅ Script généré en ${elapsed.toFixed(1)}s`);
        resolve(script);
      } catch (e) {
        reject(new Error(`JSON parse error: ${e.message}`));
      }
    });
  });
}

module.exports = { generateVideoScriptWithKill };

// Test
if (require.main === module) {
  const article = {
    title: "Test vidéo",
    content: "Test content...",
    url: "https://example.com"
  };
  
  generateVideoScriptWithKill(article).then(script => {
    console.log('\n✅ Script:', script.duration, 's');
  }).catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
}
