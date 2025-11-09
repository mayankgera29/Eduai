import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

type LogEvent = {
  ts: string;           // ISO timestamp
  role: "student" | "mentor";
  content: string;
  phase?: "elicitation" | "hint" | "explain" | "answer";
  uploadUrl?: string | null;
};

const LOG_DIR = path.join(process.cwd(), "public", "uploads", "_logs");
const LOG_FILE = path.join(LOG_DIR, "logs.jsonl");

export async function POST(req: Request) {
  try {
    const ev = (await req.json()) as LogEvent | LogEvent[];
    await fs.mkdir(LOG_DIR, { recursive: true });
    const arr = Array.isArray(ev) ? ev : [ev];
    const lines = arr.map(e => JSON.stringify(e)).join("\n") + "\n";
    await fs.appendFile(LOG_FILE, lines, "utf8");
    return NextResponse.json({ ok: true, count: arr.length });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "log error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const raw = await fs.readFile(LOG_FILE, "utf8").catch(() => "");
    const lines = raw.trim().split("\n").filter(Boolean).slice(-200);
    const json = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return NextResponse.json({ ok: true, recent: json });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "read error" }, { status: 500 });
  }
}
