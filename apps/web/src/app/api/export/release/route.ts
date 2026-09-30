import { ObjectId } from "mongodb";
import {
  buildReleaseBundle,
  emitPlanEvent,
  formatBySlug,
  getRelease,
  ReleaseNotReadyError,
} from "@blogagent/engine";
import { isAuthed } from "@/lib/auth";
import { getCompany, getDb, getFormats, getStorage } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Download a whole release — a subtopic's hub and articles, or a pillar page —
 * as one Framer package: GET /api/export/release?plan=<id>&unit=<key>.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await isAuthed())) return new Response("unauthorized", { status: 401 });
  const params = new URL(request.url).searchParams;
  const planId = params.get("plan") ?? "";
  const key = params.get("unit") ?? "";
  if (!ObjectId.isValid(planId) || !key) return new Response("plan and unit are required", { status: 400 });

  const company = getCompany();
  const db = await getDb();
  const unit = await getRelease(db, new ObjectId(planId), key);
  if (!unit) return new Response("release not found", { status: 404 });

  const formats = await getFormats();
  const storage = getStorage();
  try {
    const bundle = await buildReleaseBundle(db, company, unit, {
      loadHeader: async (article) => {
        if (!article.header?.storageKey) return undefined;
        try {
          return await storage.get(article.header.storageKey);
        } catch {
          return undefined; // the page's README still says where the hero goes
        }
      },
      signoffRequired: (article) => formatBySlug(formats, article.facets?.articleType).signoff,
    });
    const now = new Date();
    const shipped = unit.members.filter((m) => !m.live && m.articleId).map((m) => new ObjectId(m.articleId as string));
    await db.articles.updateMany({ _id: { $in: shipped } }, { $set: { exportedAt: now, updatedAt: now } });
    await emitPlanEvent(db, {
      companyId: company.companyId,
      planId: new ObjectId(planId),
      type: "release.exported",
      message: `Release downloaded: ${unit.subtopicName ?? unit.title} (${bundle.pages.length} page${bundle.pages.length === 1 ? "" : "s"})`,
      data: { key, pages: bundle.pages.length },
    });
    return new Response(new Uint8Array(bundle.zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${bundle.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ReleaseNotReadyError) return new Response(err.message, { status: 409 });
    throw err;
  }
}
