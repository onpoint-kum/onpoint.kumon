// scripts/prepare-android.js
const fs = require('fs');
const path = require('path');
const { generateIcons } = require('./generate-icons');

const rootDir = path.resolve(__dirname, '..');
const appDir = path.join(rootDir, 'android', 'app');
const gradlePath = path.join(appDir, 'build.gradle');
const stringsPath = path.join(appDir, 'src', 'main', 'res', 'values', 'strings.xml');
const resDir = path.join(appDir, 'src', 'main', 'res');

const googleServicesSrc = path.join(rootDir, 'google-services.json');
const googleServicesDest = path.join(appDir, 'google-services.json');

const keystoreSrc = path.join(rootDir, 'release.keystore');
const keystoreDest = path.join(appDir, 'release.keystore');

const webClientId = '1018160708137-4lg2h422et0rbrvfi8162a4bctkn8s4b.apps.googleusercontent.com';

async function main() {
  console.log('🚀 Iniciando preparação do projeto Android nativo...');

  // 1. Copia google-services.json se existir
  if (fs.existsSync(googleServicesSrc)) {
    fs.copyFileSync(googleServicesSrc, googleServicesDest);
    console.log('✅ google-services.json copiado para android/app/');
  } else {
    console.log('ℹ️ google-services.json não encontrado na raiz.');
  }

  // 2. Copia release.keystore permanente
  if (fs.existsSync(keystoreSrc)) {
    fs.copyFileSync(keystoreSrc, keystoreDest);
    console.log('✅ release.keystore permanente copiado para android/app/');
  } else {
    console.warn('⚠️ release.keystore não encontrado na raiz!');
  }

  // 3. Injeta server_client_id em strings.xml para o Google Auth nativo
  if (fs.existsSync(stringsPath)) {
    let stringsXml = fs.readFileSync(stringsPath, 'utf8');
    if (!stringsXml.includes('server_client_id')) {
      const serverClientTag = `    <string name="server_client_id">${webClientId}</string>\n</resources>`;
      stringsXml = stringsXml.replace('</resources>', serverClientTag);
      fs.writeFileSync(stringsPath, stringsXml, 'utf8');
      console.log('✅ server_client_id injetado em strings.xml para login Google nativo!');
    } else {
      console.log('ℹ️ server_client_id já presente em strings.xml.');
    }
  }

  // 4. Injeta configuração de assinatura para o Release APK
  if (fs.existsSync(gradlePath)) {
    let content = fs.readFileSync(gradlePath, 'utf8');

    // Remove signingConfigs prévias duplicadas caso existam
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

  // 5. Gera ícones completos a partir do logotipo inteiro
  if (fs.existsSync(resDir)) {
    await generateIcons(resDir);
  }

  console.log('🎉 Preparação do Android concluída com sucesso!');
}

main().catch(err => {
  console.error('❌ Erro durante a preparação do Android:', err);
  process.exit(1);
});
