import { NextRequest, NextResponse } from "next/server";
import { requireApiSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function maskKey(key?: string | null) {
  if (!key) return "";
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET() {
  await requireApiSuperAdmin();
  const config = await prisma.aiConfiguration.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      provider: process.env.OPENAI_API_KEY ? "openai" : "gemini",
      model: process.env.GEMINI_MODEL || process.env.OPENAI_MODEL || "gemini-flash-latest",
      geminiModel: process.env.GEMINI_MODEL || "gemini-flash-latest",
      openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      geminiApiKey: process.env.GEMINI_API_KEY || null,
      openaiApiKey: process.env.OPENAI_API_KEY || null,
      cheapProvider: "gemini",
      smartProvider: "openai",
      visionProvider: "openai",
      systemContext: "A IA deve ser uma assistente financeira pratica, segura, focada em organizar dados, sugerir categorias, preparar acoes para confirmacao e ajudar usuarios leigos."
    }
  });

  return NextResponse.json({
    config: {
      id: config.id,
      provider: config.provider,
      model: config.model,
      geminiModel: config.geminiModel || process.env.GEMINI_MODEL || "gemini-flash-latest",
      openaiModel: config.openaiModel || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      cheapProvider: config.cheapProvider,
      smartProvider: config.smartProvider,
      visionProvider: config.visionProvider,
      hasApiKey: Boolean(config.apiKey || config.geminiApiKey || config.openaiApiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
      hasGeminiApiKey: Boolean(config.geminiApiKey || process.env.GEMINI_API_KEY || (config.provider === "gemini" && config.apiKey)),
      hasOpenaiApiKey: Boolean(config.openaiApiKey || process.env.OPENAI_API_KEY || (config.provider === "openai" && config.apiKey)),
      apiKeyMasked: maskKey(config.apiKey),
      geminiApiKeyMasked: maskKey(config.geminiApiKey || process.env.GEMINI_API_KEY),
      openaiApiKeyMasked: maskKey(config.openaiApiKey || process.env.OPENAI_API_KEY),
      systemContext: config.systemContext || "",
      webSearchEnabled: config.webSearchEnabled,
      autoExecute: config.autoExecute,
      updatedAt: config.updatedAt
    }
  });
}

export async function POST(request: NextRequest) {
  const user = await requireApiSuperAdmin();
  const body = await request.json();
  const provider = text(body.provider) || "gemini";
  const model = text(body.model) || (provider === "openai" ? "gpt-4.1-mini" : "gemini-flash-latest");
  const apiKey = text(body.apiKey);
  const geminiApiKey = text(body.geminiApiKey);
  const openaiApiKey = text(body.openaiApiKey);
  const geminiModel = text(body.geminiModel) || "gemini-flash-latest";
  const openaiModel = text(body.openaiModel) || "gpt-4.1-mini";

  const data: any = {
    provider,
    model,
    geminiModel,
    openaiModel,
    cheapProvider: text(body.cheapProvider) || "gemini",
    smartProvider: text(body.smartProvider) || "openai",
    visionProvider: text(body.visionProvider) || "openai",
    systemContext: text(body.systemContext),
    webSearchEnabled: Boolean(body.webSearchEnabled),
    autoExecute: Boolean(body.autoExecute),
    updatedById: user.id
  };
  if (apiKey) data.apiKey = apiKey;
  if (geminiApiKey) data.geminiApiKey = geminiApiKey;
  if (openaiApiKey) data.openaiApiKey = openaiApiKey;

  const config = await prisma.aiConfiguration.upsert({
    where: { id: "global" },
    update: data,
    create: { id: "global", ...data }
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "superadmin_update_ai_settings",
    entity: "aiConfiguration",
    entityId: config.id,
    request,
    metadata: {
      provider,
      model,
      geminiModel,
      openaiModel,
      webSearchEnabled: config.webSearchEnabled,
      autoExecute: config.autoExecute,
      changedApiKey: Boolean(apiKey),
      changedGeminiApiKey: Boolean(geminiApiKey),
      changedOpenaiApiKey: Boolean(openaiApiKey)
    }
  });

  return NextResponse.json({
    config: {
      id: config.id,
      provider: config.provider,
      model: config.model,
      geminiModel: config.geminiModel || "gemini-flash-latest",
      openaiModel: config.openaiModel || "gpt-4.1-mini",
      cheapProvider: config.cheapProvider,
      smartProvider: config.smartProvider,
      visionProvider: config.visionProvider,
      hasApiKey: Boolean(config.apiKey || config.geminiApiKey || config.openaiApiKey),
      hasGeminiApiKey: Boolean(config.geminiApiKey),
      hasOpenaiApiKey: Boolean(config.openaiApiKey),
      apiKeyMasked: maskKey(config.apiKey),
      geminiApiKeyMasked: maskKey(config.geminiApiKey),
      openaiApiKeyMasked: maskKey(config.openaiApiKey),
      systemContext: config.systemContext || "",
      webSearchEnabled: config.webSearchEnabled,
      autoExecute: config.autoExecute,
      updatedAt: config.updatedAt
    }
  });
}
