// build.js - Prepara o diretório www para o Capacitor empacotar o APK
const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const outDir = path.join(__dirname, 'www');

const filesToCopy = [
  'index.html',
  'style.css',
  'app.js',
  'audio.js',
  'firebase-config.js',
  'version.json',
  'imported_students.js',
  'imported_students.json'
];

const dirsToCopy = ['assets'];

// Limpa e recria diretório www
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// Copia arquivos principais
filesToCopy.forEach(file => {
  const src = path.join(srcDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(outDir, file));
  }
});

// Copia capacitor.js do @capacitor/core se existir
const capJsSrc = path.join(srcDir, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js');
const capJsDest = path.join(outDir, 'capacitor.js');
if (fs.existsSync(capJsSrc)) {
  fs.copyFileSync(capJsSrc, capJsDest);
  console.log('✅ capacitor.js incluído no diretório www');
}

// Copia diretórios (como assets)
dirsToCopy.forEach(dir => {
  const src = path.join(srcDir, dir);
  const dest = path.join(outDir, dir);
  if (fs.existsSync(src)) {
    copyFolderRecursiveSync(src, dest);
  }
});

function copyFolderRecursiveSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyFolderRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('✅ Diretório www construído com sucesso para o Capacitor!');
