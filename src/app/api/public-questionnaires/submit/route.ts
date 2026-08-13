import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureHmsQuestionnaire, parseQuestions } from "@/lib/public-questionnaire";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const questionnaireId = String(body.questionnaireId || "");
    const slug = String(body.slug || "");
    if (slug === "hms-saude-estetica") await ensureHmsQuestionnaire();
    const questionnaire = questionnaireId
      ? await prisma.publicQuestionnaire.findUnique({ where: { id: questionnaireId } })
      : slug
        ? await prisma.publicQuestionnaire.findUnique({ where: { slug } })
        : null;
    if (!questionnaire || !questionnaire.active) {
      return NextResponse.json({ error: "Questionario nao encontrado." }, { status: 404 });
    }

    const respondentName = String(body.respondentName || "").trim();
    if (!respondentName) {
      return NextResponse.json({ error: "Informe o nome completo para enviar." }, { status: 400 });
    }

    const questions = parseQuestions(questionnaire.questions);
    const rawAnswers = body.answers && typeof body.answers === "object" ? body.answers : {};
    const answers = Object.fromEntries(
      questions.map((question) => [question.id, String(rawAnswers[question.id] || "").trim()])
    );

    const submission = await prisma.publicQuestionnaireSubmission.create({
      data: {
        questionnaireId: questionnaire.id,
        respondentName,
        respondentPhone: String(body.respondentPhone || "").trim() || null,
        respondentEmail: String(body.respondentEmail || "").trim() || null,
        answers: JSON.stringify(answers),
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        userAgent: request.headers.get("user-agent")
      }
    });

    return NextResponse.json({ ok: true, id: submission.id });
  } catch (error) {
    console.error("public-questionnaires submit failed", error);
    return NextResponse.json({ error: "Nao foi possivel salvar as respostas." }, { status: 500 });
  }
}
