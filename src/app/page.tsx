"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Brain, ChevronRight, RotateCcw, Paperclip } from "lucide-react";

type Phase = "elicitation" | "hint" | "explain" | "answer";
type Role = "student" | "mentor";

const PTS_ON_ATTEMPT = 5;
const PTS_ON_CODE = 5;

async function logEvents(ev: any | any[]) {
  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev),
    });
  } catch {}
}

export default function Page() {
  // chat state
  const [phase, setPhase] = useState<Phase>("elicitation");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: Role; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string>("");

  // points
  const [points, setPoints] = useState<number>(0);
  const [attempts, setAttempts] = useState<number>(0);

  // attach file
  const [attach, setAttach] = useState<File | null>(null);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachUrl, setAttachUrl] = useState<string>("");

  useEffect(() => {
    try {
      const p = Number(localStorage.getItem("eduai.points") || "0");
      const a = Number(localStorage.getItem("eduai.attempts") || "0");
      setPoints(Number.isFinite(p) ? p : 0);
      setAttempts(Number.isFinite(a) ? a : 0);
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("eduai.points", String(points)); } catch {} }, [points]);
  useEffect(() => { try { localStorage.setItem("eduai.attempts", String(attempts)); } catch {} }, [attempts]);

  const progress = { elicitation: 15, hint: 40, explain: 70, answer: 100 }[phase];
  const attempted = useMemo(() => messages.some(m => m.role === "student"), [messages]);

  async function uploadAttachmentIfAny() {
    if (!attach) return "";
    setAttachUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", attach);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data?.ok && data.url) {
        setAttachUrl(data.url);
        return data.url as string;
      }
      return "";
    } catch {
      return "";
    } finally {
      setAttachUploading(false);
      setAttach(null); // reset after trying
    }
  }

  async function send(toPhase: Phase) {
    const userIsAttempting = Boolean(input.trim() || attach);
    if (!input && !attach && messages.length === 0) return;

    setLoading(true);
    setCode("");

    // 1) upload any attachment first
    const uploadedUrl = await uploadAttachmentIfAny();
    // 2) compose student content (include attachment URL if present)
    const contentWithAttach =
      input.trim() + (uploadedUrl ? `\n[attached: ${uploadedUrl}]` : "");

    try {
      // log student turn
      if (contentWithAttach) {
        await logEvents({
          ts: new Date().toISOString(),
          role: "student",
          content: contentWithAttach,
          phase: toPhase,
          uploadUrl: uploadedUrl || null,
        });
      }

      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: contentWithAttach
            ? [...messages, { role: "student", content: contentWithAttach }]
            : messages,
          phase: toPhase,
          topic: "coding",
        }),
      });
      const data = await res.json();

      if (contentWithAttach) {
        setMessages((m) => [...m, { role: "student", content: contentWithAttach }]);
        if (userIsAttempting) {
          setAttempts((a) => a + 1);
          setPoints((p) => p + PTS_ON_ATTEMPT);
        }
      }
      setMessages((m) => [...m, { role: "mentor", content: data.reply }]);
      setPhase(data.phase as Phase);
      setInput("");

      // log mentor turn
      await logEvents({
        ts: new Date().toISOString(),
        role: "mentor",
        content: data.reply,
        phase: data.phase as Phase,
        uploadUrl: null,
      });
    } finally {
      setLoading(false);
    }
  }

  async function generateCode(lang: "cpp" | "python") {
    setLoading(true);
    try {
      const prompt = [...messages, input ? { role: "student" as Role, content: input } : null]
        .filter(Boolean)
        .map((m: any) => m.content)
        .join("\n")
        .slice(-2000);
      const res = await fetch("/api/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, language: lang }),
      });
      const data = await res.json();
      setCode(data.code || "");
      setPoints((p) => p + PTS_ON_CODE);

      // log code block as mentor content (for record)
      await logEvents({
        ts: new Date().toISOString(),
        role: "mentor",
        content: `\`\`\`${lang}\n${data.code || ""}\n\`\`\``,
        phase: "answer",
        uploadUrl: null,
      });
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setMessages([]);
    setPhase("elicitation");
    setInput("");
    setCode("");
    setAttach(null);
    setAttachUrl("");
  }

  function copyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code).catch(() => {});
  }

  const tier = points >= 50 ? "Gold" : points >= 25 ? "Silver" : points >= 10 ? "Bronze" : "Learner";

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Brain className="w-6 h-6" />
          <h1 className="text-2xl font-semibold tracking-tight">EduAI Mentor</h1>
          <Badge variant="secondary">MVP</Badge>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Badge>Points: {points}</Badge>
            <Badge variant="outline">Attempts: {attempts}</Badge>
            <Badge variant="default">{tier}</Badge>
          </div>
        </div>

        {/* Mentor Card */}
        <Card className="shadow-sm border rounded-2xl">
          <CardContent className="p-5 space-y-4">
            {/* Input row with attach */}
            <div className="flex gap-2 items-center">
              <label className="h-11 w-11 inline-flex items-center justify-center rounded-md border bg-white hover:bg-neutral-50 cursor-pointer">
                <Paperclip className="w-5 h-5" />
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setAttach(e.target.files?.[0] ?? null)}
                />
              </label>
              <Input
                autoFocus
                placeholder={attach ? `Attached: ${attach.name}` : "Type your answer or question…"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && send(phase)}
                className="h-11"
              />
              <Button className="h-11 px-5" disabled={loading || (!input && !attach && messages.length === 0)} onClick={() => send(phase)}>
                {loading ? (attachUploading ? "Uploading…" : "Thinking…") : <><ChevronRight className="w-4 h-4 mr-1" /> Reply</>}
              </Button>
              <Button className="h-11" variant="secondary" onClick={reset} title="New session">
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            {/* Progress */}
            <div className="text-sm text-neutral-600">Learning phase: <b>{phase}</b></div>
            <Progress value={progress} />

            {/* Chat */}
            <div className="space-y-2 max-h-[42vh] overflow-auto rounded-xl border bg-white p-4">
              {messages.length === 0 && (
                <p className="text-neutral-500 text-sm">
                  Flow: Mentor asks → hint → explain → final answer/code last. You can attach a file with the paperclip.
                </p>
              )}
              {messages.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={m.role === "student" ? "text-right" : "text-left"}>
                  <div
                    className={[
                      "inline-block px-4 py-2 rounded-2xl text-[0.95rem] leading-6 shadow-sm",
                      "whitespace-pre-wrap break-words max-w-[40rem]",
                      m.role === "student" ? "bg-blue-50" : "bg-neutral-100"
                    ].join(" ")}
                  >
                    <span className="font-semibold mr-2">{m.role === "student" ? "You:" : "Mentor:"}</span>
                    {m.content}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={loading} onClick={() => send("elicitation")}>Ask guiding question</Button>
              <Button variant="outline" disabled={loading} onClick={() => send("hint")}>Give hint</Button>
              <Button variant="outline" disabled={loading} onClick={() => send("explain")}>Explain step-by-step</Button>
              <Button disabled={loading} onClick={() => send("answer")}>Reveal answer</Button>

              <Button variant="default" disabled={loading || !attempted} onClick={() => generateCode("cpp")}>
                Generate C++ code
              </Button>
              <Button variant="outline" disabled={loading || !attempted} onClick={() => generateCode("python")}>
                Generate Python code
              </Button>
              <Button variant="secondary" disabled={!code} onClick={copyCode}>Copy code</Button>
            </div>

            {/* Code display */}
            {code && (
              <div className="mt-2">
                <div className="text-sm font-medium mb-1">Generated code:</div>
                <pre className="p-4 bg-neutral-900 text-neutral-100 rounded-md overflow-auto text-sm whitespace-pre leading-6 max-h-[40vh]">
<code>{code}</code>
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
