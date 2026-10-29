// scripts/generate-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..');
const logoPath = path.join(rootDir, 'assets', 'onpoint.png');

// Mipmap configurations for Android
const sizes = [
  { dir: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { dir: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { dir: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { dir: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

async function generateIcons(targetResDir) {
  if (!fs.existsSync(logoPath)) {
    console.error('❌ Logo não encontrado em:', logoPath);
    return;
  }

  console.log('🎨 Gerando ícones do Android a partir do logotipo inteiro...');

  for (const { dir, launcher, foreground } of sizes) {
    const outDir = path.join(targetResDir, dir);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // 1. Gera Foreground para Adaptive Icon (transparente, logo centralizado no safe-zone)
    // Safe zone no adaptive icon é ~66% da largura. Com aspect ratio ~8.4:
    const logoFgWidth = Math.round(foreground * 0.62);
    const resizedFgLogo = await sharp(logoPath)
      .resize({ width: logoFgWidth, fit: 'inside' })
      .toBuffer();

    await sharp({
      create: {
        width: foreground,
        height: foreground,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: resizedFgLogo, gravity: 'center' }])
      .png()
      .toFile(path.join(outDir, 'ic_launcher_foreground.png'));

    // 2. Gera ic_launcher.png (Quadrado com fundo branco e logo centralizado)
    const logoLauncherWidth = Math.round(launcher * 0.88);
    const resizedLauncherLogo = await sharp(logoPath)
      .resize({ width: logoLauncherWidth, fit: 'inside' })
      .toBuffer();

    await sharp({
      create: {
        width: launcher,
        height: launcher,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([{ input: resizedLauncherLogo, gravity: 'center' }])
      .png()
      .toFile(path.join(outDir, 'ic_launcher.png'));

    // 3. Gera ic_launcher_round.png (Redondo com fundo branco)
    // Cria máscara circular
    const radius = launcher / 2;
    const circleSvg = Buffer.from(
      `<svg width="${launcher}" height="${launcher}"><circle cx="${radius}" cy="${radius}" r="${radius}" fill="#FFFFFF"/></svg>`
    );

    const logoRoundWidth = Math.round(launcher * 0.78);
    const resizedRoundLogo = await sharp(logoPath)
      .resize({ width: logoRoundWidth, fit: 'inside' })
      .toBuffer();

    await sharp(circleSvg)
      .composite([{ input: resizedRoundLogo, gravity: 'center' }])
      .png()
      .toFile(path.join(outDir, 'ic_launcher_round.png'));

    console.log(`  ✅ ${dir}: ic_launcher (${launcher}x${launcher}) & foreground (${foreground}x${foreground}) gerados.`);
  }

  // 4. Garante que ic_launcher_background.xml seja branco (#FFFFFF)
  const valuesDir = path.join(targetResDir, 'values');
  if (!fs.existsSync(valuesDir)) {
    fs.mkdirSync(valuesDir, { recursive: true });
  }

  const bgXmlPath = path.join(valuesDir, 'ic_launcher_background.xml');
  const bgXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
`;
  fs.writeFileSync(bgXmlPath, bgXmlContent, 'utf8');

  console.log('🎉 Todos os ícones do app foram gerados com o logotipo inteiro!');
}

module.exports = { generateIcons };

if (require.main === module) {
  const defaultRes = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');
  generateIcons(defaultRes).catch(err => {
    console.error('Erro ao gerar ícones:', err);
    process.exit(1);
  });
}
