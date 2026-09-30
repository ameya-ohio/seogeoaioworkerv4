import { buildFramerBundle, ExportRefusedError } from "@blogagent/engine";
import { isAuthed } from "@/lib/auth";
import { getCompany, getDb, getFormats, getStorage } from "@/lib/db";
import { formatBySlug, stillDeferredLinks } from "@blogagent/engine";

export const dynamic = "force-dynamic";

/** D52: download the Framer export bundle for an article in Review. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  if (!(await isAuthed())) return new Response("unauthorized", { status: 401 });
  const { slug } = await params;
  const company = getCompany();
  const db = await getDb();
  const article = await db.articles.findOne({ companyId: company.companyId, slug });
  if (!article) return new Response("not found", { status: 404 });

  let headerPng: Buffer | undefined;
  if (article.header?.storageKey) {
    try {
      headerPng = await getStorage().get(article.header.storageKey);
    } catch {
      headerPng = undefined; // the README still says where the hero goes
    }
  }
  const format = formatBySlug(await getFormats(), article.facets?.articleType);
  try {
    const bundle = buildFramerBundle(article, company, {
      ...(headerPng ? { headerPng } : {}),
      signoffRequired: format.signoff,
      deferredLinks: await stillDeferredLinks(db, article),
    });
    await db.articles.updateOne({ _id: article._id }, { $set: { exportedAt: new Date(), updatedAt: new Date() } });
    return new Response(new Uint8Array(bundle.zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${bundle.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ExportRefusedError) return new Response(err.message, { status: 409 });
    throw err;
  }
}
