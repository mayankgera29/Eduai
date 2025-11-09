import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";

// Save a single file posted as multipart/form-data with key "file"
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided (field name must be 'file')." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });

    const origName = file.name || "upload";
    const ext = path.extname(origName).slice(1); // without dot
    const safeExt = ext?.substring(0, 10).toLowerCase();
    const fname = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt ? "." + safeExt : ""}`;
    const filePath = path.join(uploadsDir, fname);

    await fs.writeFile(filePath, buffer);

    const url = `/uploads/${fname}`;
    return NextResponse.json({
      ok: true,
      url,
      name: origName,
      size: file.size,
      type: file.type,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Upload failed" }, { status: 500 });
  }
}

// Optional: list uploaded files
export async function GET() {
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  try {
    const items = await fs.readdir(uploadsDir);
    return NextResponse.json({ files: items.map((n) => `/uploads/${n}`) });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
