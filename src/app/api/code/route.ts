import { NextResponse } from "next/server";

export const runtime = "nodejs";

function extractCode(text: string) {
  const m = text.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
  return m ? m[1].trim() : text.trim();
}

export async function POST(req: Request) {
  try {
    const { prompt = "", language = "cpp" } = await req.json();
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) {
      return NextResponse.json({ code: "// Missing GROQ_API_KEY. Add it in .env.local" });
    }

    const langName = language === "python" ? "Python" : "C++";
    const sys = `You generate clean, well-commented ${langName} code. Keep output inside one fenced code block only. No extra text.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Task: ${prompt}\n\nReturn ONLY ${langName} code. If language is ${langName}, wrap it in proper triple backticks.` },
        ],
      }),
    });

    const text = await res.text();
    if (!res.ok) return NextResponse.json({ code: `// Groq error ${res.status}: ${text}` });

    const data = JSON.parse(text);
    const raw = data?.choices?.[0]?.message?.content || "";
    const code = extractCode(raw);
    return NextResponse.json({ code });
  } catch (err: any) {
    return NextResponse.json({ code: `// Code gen error: ${err?.message || err}` });
  }
}
