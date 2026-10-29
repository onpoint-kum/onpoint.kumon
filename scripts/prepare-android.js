// scripts/prepare-android.js
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
const googleServicesSrc = path.join(rootDir, 'google-services.json');
const googleServicesDest = path.join(rootDir, 'android', 'app', 'google-services.json');

// 1. Copia google-services.json se existir
if (fs.existsSync(googleServicesSrc)) {
  fs.copyFileSync(googleServicesSrc, googleServicesDest);
  console.log('✅ google-services.json copiado para android/app/');
} else {
  console.log('ℹ️ google-services.json não encontrado na raiz.');
}

// 2. Injeta configuração de assinatura para o Release APK
if (fs.existsSync(gradlePath)) {
  let content = fs.readFileSync(gradlePath, 'utf8');

  // Limpa signingConfigs anteriores caso existam
  if (content.includes('signingConfigs {')) {
    content = content.replace(/\s*signingConfigs\s*\{[\s\S]*?\}\s*\}\n/m, '\n');
    content = content.replace(/\s*signingConfig signingConfigs\.release\n/g, '\n');
  }

  const signingBlock = [
    '    signingConfigs {',
    '        release {',
    "            storeFile file('release.keystore')",
    "            storePassword 'kumon2026'",
    "            keyAlias 'onpoint'",
    "            keyPassword 'kumon2026'",
    '        }',
    '    }',
    ''
  ].join('\n');

  content = content.replace(/buildTypes\s*\{/, signingBlock + '    buildTypes {');
  
  const buildTypesIdx = content.indexOf('buildTypes {');
  const before = content.substring(0, buildTypesIdx);
  let after = content.substring(buildTypesIdx);
  after = after.replace(/release\s*\{/, 'release {\n            signingConfig signingConfigs.release');

  content = before + after;
  fs.writeFileSync(gradlePath, content, 'utf8');
  console.log('✅ Assinatura Release injetada corretamente no android/app/build.gradle!');
} else {
  console.error('❌ android/app/build.gradle não encontrado!');
  process.exit(1);
}
