import { NextResponse } from "next/server";
import { systemPrompt } from "@/lib/mentorPrompt";

export const runtime = "nodejs";

type Phase = "elicitation" | "hint" | "explain" | "answer";
type Role = "student" | "mentor";
interface MentorRequest {
  messages: { role: Role; content: string }[];
  phase?: Phase;
  topic?: string;
}
const nextPhase = (p: Phase): Phase =>
  p === "elicitation" ? "hint" :
  p === "hint" ? "explain" :
  p === "explain" ? "answer" :
  "elicitation";

async function groqChat(payload: any) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY || ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Groq ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { throw new Error(`Bad JSON from Groq: ${text.slice(0,200)}...`); }
}

export async function POST(req: Request) {
  const key = process.env.GROQ_API_KEY?.trim();
  try {
    const body = (await req.json()) as MentorRequest;
    const { messages = [], phase = "elicitation", topic = "general" } = body;

    if (!key) {
      const fallback =
        phase === "elicitation" ? "Before we jump in: What do you already know about this topic?" :
        phase === "hint" ? "Hint: Break the problem into smaller steps and test with a tiny example." :
        phase === "explain" ? "Plan:\n1) Define inputs/outputs\n2) Identify base cases\n3) Outline algorithm\n4) Test edge cases" :
        "Here’s how you’d finalize the solution. Want me to format the full code now?";
      return NextResponse.json({ phase: nextPhase(phase), reply: fallback });
    }

    const history = messages.slice(-10).map(m => ({
      role: m.role === "student" ? "user" : "assistant",
      content: m.content,
    }));

    const payload = {
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "system", content: `Current phase: ${phase}. Topic: ${topic}. STRICTLY follow phase rules. If phase is not "answer", DO NOT include any code blocks or pseudo-code; ask questions or explain concepts only.` },
        ...history,
      ],
    };

    // Try up to 2 attempts
    let data: any, reply = "";
    for (let i = 0; i < 2 && !reply; i++) {
      try {
        data = await groqChat(payload);
        reply = data?.choices?.[0]?.message?.content?.trim?.() || "";
      } catch (e) {
        if (i === 1) throw e;
      }
    }

    if (!reply) {
      // keep SAME phase on failure-like empty reply
      return NextResponse.json({
        phase,
        reply:
          "I couldn’t generate a response just now. Tell me briefly what you already know, or click “Ask guiding question”.",
      });
    }

    return NextResponse.json({ phase: nextPhase(phase), reply });
  } catch (err: any) {
    return NextResponse.json({
      phase: "elicitation",
      reply: `Mentor error: ${err?.message || err}. Try again or rephrase.`,
    });
  }
}
