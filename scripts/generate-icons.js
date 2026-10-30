// scripts/generate-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..');
const faviconPath = path.join(rootDir, 'assets', 'onpoint-favicon.png');
const fallbackLogoPath = path.join(rootDir, 'assets', 'onpoint.png');

// Mipmap configurations for Android
const sizes = [
  { dir: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { dir: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { dir: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { dir: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

async function generateIcons(targetResDir) {
  const iconSource = fs.existsSync(faviconPath) ? faviconPath : fallbackLogoPath;
  if (!fs.existsSync(iconSource)) {
    console.error('❌ Ícone não encontrado em:', iconSource);
    return;
  }

  console.log(`🎨 Gerando ícones do Android a partir de ${path.basename(iconSource)} (com suporte a Tema / Material You)...`);

  for (const { dir, launcher, foreground } of sizes) {
    const outDir = path.join(targetResDir, dir);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // 1. Gera Foreground para Adaptive Icon (transparente, ícone centralizado no safe-zone: ~60% do tamanho)
    const logoFgWidth = Math.round(foreground * 0.62);
    const logoFgHeight = Math.round(foreground * 0.62);
    const resizedFg = await sharp(iconSource)
      .resize({ width: logoFgWidth, height: logoFgHeight, fit: 'inside' })
      .toBuffer();

    await sharp({
      create: {
        width: foreground,
        height: foreground,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: resizedFg, gravity: 'center' }])
      .png()
      .toFile(path.join(outDir, 'ic_launcher_foreground.png'));

    // 1b. Gera Monocromático (silhueta opaca branca pura) para Tema Dinâmico do Android 13+ (Themed Icons / Material You)
    const monoBuffer = await sharp(iconSource)
      .resize({ width: logoFgWidth, height: logoFgHeight, fit: 'inside' })
      .ensureAlpha()
      // Mantém apenas a silhueta em branco (#FFFFFF)
      .threshold(1)
      .toBuffer();

    await sharp({
      create: {
        width: foreground,
        height: foreground,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: monoBuffer, gravity: 'center' }])
      .png()
      .toFile(path.join(outDir, 'ic_launcher_monochrome.png'));

    // 2. Gera ic_launcher.png (Quadrado com cantos arredondados / fundo branco)
    const logoLauncherSize = Math.round(launcher * 0.76);
    const resizedLauncher = await sharp(iconSource)
      .resize({ width: logoLauncherSize, height: logoLauncherSize, fit: 'inside' })
      .toBuffer();

    await sharp({
      create: {
        width: launcher,
        height: launcher,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([{ input: resizedLauncher, gravity: 'center' }])
      .png()
      .toFile(path.join(outDir, 'ic_launcher.png'));

    // 3. Gera ic_launcher_round.png (Redondo com fundo branco)
    const radius = launcher / 2;
    const circleSvg = Buffer.from(
      `<svg width="${launcher}" height="${launcher}"><circle cx="${radius}" cy="${radius}" r="${radius}" fill="#FFFFFF"/></svg>`
    );

    const logoRoundSize = Math.round(launcher * 0.72);
    const resizedRound = await sharp(iconSource)
      .resize({ width: logoRoundSize, height: logoRoundSize, fit: 'inside' })
      .toBuffer();

    await sharp(circleSvg)
      .composite([{ input: resizedRound, gravity: 'center' }])
      .png()
      .toFile(path.join(outDir, 'ic_launcher_round.png'));

    console.log(`  ✅ ${dir}: ic_launcher (${launcher}x${launcher}), foreground & monochrome (${foreground}x${foreground}) gerados.`);
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

  // 5. Configura Adaptive Icon com Suporte a Tema Dinâmico do Android (Material You / Themed Icon)
  const anydpiDir = path.join(targetResDir, 'mipmap-anydpi-v26');
  if (!fs.existsSync(anydpiDir)) {
    fs.mkdirSync(anydpiDir, { recursive: true });
  }

  const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'), adaptiveIconXml, 'utf8');
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), adaptiveIconXml, 'utf8');

  // 6. Também gera a versão específica para v33+ garantindo compatibilidade temática
  const v33Dir = path.join(targetResDir, 'mipmap-anydpi-v33');
  if (!fs.existsSync(v33Dir)) {
    fs.mkdirSync(v33Dir, { recursive: true });
  }
  fs.writeFileSync(path.join(v33Dir, 'ic_launcher.xml'), adaptiveIconXml, 'utf8');
  fs.writeFileSync(path.join(v33Dir, 'ic_launcher_round.xml'), adaptiveIconXml, 'utf8');

  console.log('🎉 Todos os ícones do app foram gerados com sucesso com suporte a temas dinâmicos!');
}

module.exports = { generateIcons };

if (require.main === module) {
  const defaultRes = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');
  generateIcons(defaultRes).catch(err => {
    console.error('Erro ao gerar ícones:', err);
    process.exit(1);
  });
}
