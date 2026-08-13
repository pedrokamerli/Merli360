import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseAnswers, parseQuestions, submissionToTxt } from "@/lib/public-questionnaire";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
  await requireApiUser();
  const { submissionId } = await params;
  const submission = await prisma.publicQuestionnaireSubmission.findUnique({
    where: { id: submissionId },
    include: { questionnaire: true }
  });
  if (!submission) {
    return NextResponse.json({ error: "Resposta nao encontrada." }, { status: 404 });
  }

  const txt = submissionToTxt({
    title: submission.questionnaire.title,
    createdAt: submission.createdAt,
    respondentName: submission.respondentName,
    respondentPhone: submission.respondentPhone,
    respondentEmail: submission.respondentEmail,
    questions: parseQuestions(submission.questionnaire.questions),
    answers: parseAnswers(submission.answers)
  });

  const filename = `questionario-${(submission.respondentName || "resposta").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`;
  return new NextResponse(txt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
