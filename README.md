# 📘 Kumon Onpoint • Sistema de Ponto & Carteirinha Digital

Sistema de controle de frequência, ponto via QR Code e carteirinhas digitais para unidades **Kumon**, desenvolvido especialmente para a equipe de **Isabela Molina** com identidade visual neo-pop moderna inspirada no estilo do **Elgaly Express**.

---

## 🌟 Principais Recursos

1. **🔐 Login com Google & Perfil do Professor:**
   - Autenticação direta e segura via Google.
   - Cadastro completo dos professores (Nome completo, sexo, idade, telefone).
   - **Prefixo e apelido carinhoso automáticos:**
     - Feminino → Prefixo **"Tia"** (Ex: *Isabela* → **Tia Isa**, *Mariana* → **Tia Mari**).
     - Masculino → Prefixo **"Tio"** (Ex: *Gabriel* → **Tio Gabi**, *Lucas* → **Tio Lu**).
     - Outro → Prefixo **"Prof."**.
   - Saudação personalizada no topo: **"Oi, Tia Isa! 👋"**.

2. **👥 Cadastro de Alunos com KumonID Automático:**
   - Professores cadastram novos alunos informando nome, idade, responsável e contato.
   - Cada aluno recebe automaticamente um identificador oficial com prefixo **`KUM-`** (ex: `KUM-0001`, `KUM-0002`).
   - Opção de remover alunos do sistema com confirmação segura.

3. **📚 Gestão Dinâmica de Matérias (Disciplinas):**
   - Os professores podem adicionar novas matérias ao sistema (Matemática, Português, Inglês, Japonês, Kokugo, etc.).
   - Cores personalizadas e ícones para cada matéria.
   - No cadastro do aluno, as matérias cadastradas aparecem dinamicamente para seleção múltipla.

4. **📷 Totem de Ponto com Leitor de QR Code:**
   - Leitor em tempo real via câmera (frontal ou traseira).
   - Entrada manual pelo KumonID para casos de emergência.
   - **Detecção automática:**
     - Se o aluno não entrou hoje: registra **Entrada** com som acolhedor.
     - Se o aluno já está em aula: registra **Saída**, calcula o tempo exato de estudos (ex: *45 minutos*) e emite som comemorativo.
   - Cards com frases motivacionais do Kumon.

5. **🪪 Carteirinha Digital & Versão Mobile:**
   - Crachá oficial com o logotipo do Kumon, nome do aluno, KumonID, matérias e QR Code gerado em alta resolução.
   - Perfeita para os alunos abrirem no celular ou para impressão física (individual ou em folha de lote A4).

6. **🟢 Alunos Presentes Agora (Ao Vivo):**
   - Painel em tempo real mostrando todos os alunos atualmente em sala de estudos com cronômetro decorrido.
   - Botão para dar saída rápida direto pelo card.

7. **📊 Histórico, Frequência & Exportação:**
   - Tabela de presenças do dia com filtros por aluno e disciplina.
   - Exportação para planilha CSV (compatível com Microsoft Excel).
   - Impressão de folha de frequência oficial.

---

## 🚀 Como Executar

O projeto foi criado em:
`C:\Users\livin\.gemini\antigravity\scratch\kumon-ponto`

Você pode abrir a pasta no seu editor ou executar um servidor local com qualquer um dos comandos abaixo:

```bash
# Opção 1: Via npx serve (Node.js)
npx serve C:\Users\livin\.gemini\antigravity\scratch\kumon-ponto

# Opção 2: Via Python
python -m http.server 3000 --directory "C:\Users\livin\.gemini\antigravity\scratch\kumon-ponto"
```

Ou simplesmente abrir o arquivo `index.html` diretamente no seu navegador!

---

## 🗄️ Estrutura dos Arquivos

- `index.html` - Interface completa com todas as abas, modais e elementos visuais.
- `style.css` - Estilo Neo-Brutalist pop moderno com paleta Kumon, sombras duras e responsividade mobile.
- `app.js` - Lógica de ponto, geração de QR code, cronômetro em tempo real e filtros.
- `firebase-config.js` - Conexão com Firebase Authentication (Google) e Firestore Database.
- `audio.js` - Efeitos sonoros harmônicos sintetizados via Web Audio API (100% offline).
- `assets/`
  - `kumon-logo.png` - Logotipo oficial do Kumon (copiado dos seus downloads).
  - `qrcode.min.js` - Gerador de QR Code local offline.
  - `html5-qrcode.min.js` - Leitor de QR Code via câmera local offline.
