const fs = require("fs");
const path = require("path");

const sourcePath = path.join(process.cwd(), "src", "lib", "public-questionnaire.ts");
const outputDir = path.join(process.cwd(), "public-static", "quest");
const outputPath = path.join(outputDir, "index.html");
const source = fs.readFileSync(sourcePath, "utf8");
const questions = [...source.matchAll(/\{\s*id:\s*"([^"]+)",\s*section:\s*"([^"]+)",\s*text:\s*"([^"]+)"\s*\}/g)]
  .map((match) => ({ id: match[1], section: match[2], text: match[3] }));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const sections = questions.reduce((acc, question) => {
  const current = acc[acc.length - 1];
  if (!current || current.title !== question.section) acc.push({ title: question.section, questions: [question] });
  else current.questions.push(question);
  return acc;
}, []);

const sectionsHtml = sections.map((section) => `
  <section class="card">
    <p class="eyebrow">${escapeHtml(section.title)}</p>
    <div class="questions">
      ${section.questions.map((question, index) => `
        <label class="field">
          <span>${index + 1}. ${escapeHtml(question.text)}</span>
          <textarea name="${escapeHtml(question.id)}" rows="3" placeholder="Responda aqui..."></textarea>
        </label>
      `).join("")}
    </div>
  </section>
`).join("");

const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Questionario HMS Saude & Estetica</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: #eef2f7; color: #0f172a; }
    main { width: min(1040px, 100%); margin: 0 auto; padding: 24px 14px 80px; }
    .hero { background: #080f1f; color: #fff; border-radius: 28px; padding: 28px; box-shadow: 0 20px 50px rgba(15, 23, 42, .22); }
    .hero h1 { margin: 10px 0 10px; font-size: clamp(30px, 7vw, 58px); line-height: .98; letter-spacing: -1px; }
    .hero p { margin: 0; max-width: 760px; color: #cbd5e1; font-weight: 700; line-height: 1.55; }
    .eyebrow { margin: 0 0 14px; color: #6d28d9; text-transform: uppercase; letter-spacing: .15em; font-size: 12px; font-weight: 900; }
    .hero .eyebrow { color: #c4b5fd; }
    .sticky { position: sticky; top: 0; z-index: 5; margin: 16px 0; background: rgba(255,255,255,.96); border: 1px solid #dbe3ee; border-radius: 24px; padding: 16px; box-shadow: 0 14px 35px rgba(15,23,42,.12); backdrop-filter: blur(10px); }
    .topline { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; }
    .progress-text { font-weight: 900; font-size: 20px; }
    .bar { height: 9px; background: #e2e8f0; border-radius: 999px; overflow: hidden; margin-top: 12px; }
    .bar div { height: 100%; width: 0%; background: #6d28d9; transition: width .2s ease; }
    button { border: 0; border-radius: 16px; background: #6d28d9; color: #fff; font-weight: 900; padding: 13px 20px; cursor: pointer; box-shadow: 0 14px 30px rgba(109,40,217,.25); }
    button:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; }
    .card { background: #fff; border: 1px solid #dbe3ee; border-radius: 28px; padding: 20px; margin-top: 16px; box-shadow: 0 16px 40px rgba(15,23,42,.08); }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .questions { display: grid; gap: 18px; }
    .field span { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 900; line-height: 1.45; }
    input, textarea { width: 100%; border: 1px solid #dbe3ee; border-radius: 16px; background: #f8fafc; color: #0f172a; font: inherit; font-weight: 650; outline: none; padding: 13px; }
    textarea { resize: vertical; min-height: 92px; }
    input:focus, textarea:focus { border-color: #6d28d9; background: #fff; }
    .status { margin-top: 10px; font-weight: 900; color: #be123c; }
    .success { display: none; text-align: center; background: #fff; border: 1px solid #bbf7d0; border-radius: 28px; padding: 34px; margin-top: 18px; box-shadow: 0 18px 45px rgba(22,163,74,.12); }
    .success strong { display: block; color: #047857; font-size: 30px; margin-bottom: 8px; }
    @media (max-width: 760px) {
      main { padding: 12px 10px 60px; }
      .hero, .card { border-radius: 22px; padding: 18px; }
      .grid { grid-template-columns: 1fr; }
      .sticky { border-radius: 20px; }
      button { width: 100%; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Questionario</p>
      <h1>HMS Saude & Estetica</h1>
      <p>Responda com calma. Suas respostas vao ajudar a organizar posicionamento, servicos, ofertas, campanhas e objetivos comerciais.</p>
    </section>
    <form id="questionnaire">
      <section class="sticky">
        <div class="topline">
          <div>
            <p class="eyebrow">Progresso</p>
            <div class="progress-text"><span id="progress">0</span>% respondido</div>
          </div>
          <button id="submitButton" type="submit">Enviar respostas</button>
        </div>
        <div class="bar"><div id="bar"></div></div>
        <div class="status" id="status"></div>
      </section>
      <section class="card">
        <p class="eyebrow">Contato</p>
        <div class="grid">
          <label class="field"><span>Nome completo *</span><input name="respondentName" required /></label>
          <label class="field"><span>WhatsApp</span><input name="respondentPhone" /></label>
          <label class="field"><span>Email</span><input name="respondentEmail" type="email" /></label>
        </div>
      </section>
      ${sectionsHtml}
    </form>
    <section class="success" id="success">
      <strong>Questionario enviado</strong>
      <p>Obrigado. Suas respostas foram salvas com seguranca.</p>
    </section>
  </main>
  <script>
    const form = document.getElementById("questionnaire");
    const statusEl = document.getElementById("status");
    const successEl = document.getElementById("success");
    const button = document.getElementById("submitButton");
    const progress = document.getElementById("progress");
    const bar = document.getElementById("bar");
    const questionIds = ${JSON.stringify(questions.map((question) => question.id))};

    function updateProgress() {
      const answered = questionIds.filter((id) => String(new FormData(form).get(id) || "").trim()).length;
      const percent = Math.round((answered / questionIds.length) * 100);
      progress.textContent = String(percent);
      bar.style.width = percent + "%";
    }

    form.addEventListener("input", updateProgress);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      statusEl.textContent = "";
      const data = new FormData(form);
      const respondentName = String(data.get("respondentName") || "").trim();
      if (!respondentName) {
        statusEl.textContent = "Informe o nome completo para enviar.";
        return;
      }
      const answers = {};
      questionIds.forEach((id) => answers[id] = String(data.get(id) || "").trim());
      button.disabled = true;
      button.textContent = "Enviando...";
      try {
        const response = await fetch("/quest-api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "hms-saude-estetica",
            respondentName,
            respondentPhone: String(data.get("respondentPhone") || "").trim(),
            respondentEmail: String(data.get("respondentEmail") || "").trim(),
            answers
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Nao foi possivel enviar.");
        form.style.display = "none";
        successEl.style.display = "block";
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (error) {
        statusEl.textContent = error.message || "Nao foi possivel enviar. Tente novamente.";
        button.disabled = false;
        button.textContent = "Enviar respostas";
      }
    });
    updateProgress();
  </script>
</body>
</html>`;

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, html, "utf8");
console.log(`Quest page generated: ${outputPath}`);
