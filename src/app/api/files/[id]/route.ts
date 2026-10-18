import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { AppError } from "@/server/errors";
import { readAttachment } from "@/server/services/attachments";

/** Private document access: every request is authenticated and permission-checked. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { id } = await params;
  try {
    const { att, body } = await readAttachment(actor, id);
    const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": att.mimeType,
        "Content-Length": String(body.length),
        "Content-Disposition": `${disposition}; filename="${att.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) {
      const status = e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    console.error("[files] read failed", e);
    return NextResponse.json({ error: "File unavailable" }, { status: 500 });
  }
}
