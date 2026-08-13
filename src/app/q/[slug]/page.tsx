import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureHmsQuestionnaire, parseQuestions } from "@/lib/public-questionnaire";
import { PublicQuestionnaireForm } from "@/components/PublicQuestionnaireForm";

export const dynamic = "force-dynamic";

export default async function PublicQuestionnairePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "hms-saude-estetica") await ensureHmsQuestionnaire();
  const questionnaire = await prisma.publicQuestionnaire.findUnique({ where: { slug } });
  if (!questionnaire || !questionnaire.active) notFound();
  const questions = parseQuestions(questionnaire.questions);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-5xl">
        <section className="mb-6 rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-slate-300 md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-violet-300">Questionario</p>
          <h1 className="mt-3 text-3xl font-black md:text-5xl">{questionnaire.title}</h1>
          <p className="mt-3 max-w-3xl text-sm font-semibold text-slate-300">{questionnaire.description}</p>
          <p className="mt-5 text-xs font-bold text-slate-400">
            Suas respostas ficam salvas para montar estrategia, campanhas e posicionamento. Voce pode responder com calma.
          </p>
        </section>
        <PublicQuestionnaireForm questionnaireId={questionnaire.id} questions={questions} />
      </div>
    </main>
  );
}
