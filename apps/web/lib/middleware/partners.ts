import { isValidInternalRedirect, parse } from "@/lib/middleware/utils";
import { NextRequest, NextResponse } from "next/server";
import { getDefaultPartnerId } from "./utils/get-default-partner";
import { getUserViaToken } from "./utils/get-user-via-token";
import { partnersRedirect } from "./utils/partners-redirect";

const AUTHENTICATED_PATHS = [
  "/programs",
  "/marketplace",
  "/onboarding",
  "/settings",
  "/profile",
  "/payouts",
  "/account",
];

export default async function PartnersMiddleware(req: NextRequest) {
  const { path, fullPath, searchParamsObj, searchParamsString } = parse(req);

  const user = await getUserViaToken(req);

  const isAuthenticatedPath = AUTHENTICATED_PATHS.some(
    (p) => path === "/" || path.startsWith(p),
  );

  const isLoginPath = ["/login", "/register"].some(
    (p) => path.startsWith(p) || path.endsWith(p),
  );

  if (!user && isAuthenticatedPath) {
    if (path.startsWith(`/programs/`)) {
      const programSlug = path.split("/")[2];
      return NextResponse.redirect(new URL(`/${programSlug}/login`, req.url));
    }

    return NextResponse.redirect(
      new URL(
        `/login${path === "/" ? "" : `?next=${encodeURIComponent(fullPath)}`}`,
        req.url,
      ),
    );
  } else if (user && (isAuthenticatedPath || isLoginPath)) {
    const defaultPartnerId = await getDefaultPartnerId(user);

    if (!defaultPartnerId && !path.startsWith("/onboarding")) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    // Handle ?next= query param with proper validation to prevent open redirects
    if (
      searchParamsObj.next &&
      isValidInternalRedirect(searchParamsObj.next, req.url)
    ) {
      return NextResponse.redirect(new URL(searchParamsObj.next, req.url));
    }

    if (path === "/" || path.startsWith("/pn_")) {
      return NextResponse.redirect(new URL("/programs", req.url));
    } else if (isLoginPath) {
      // if is custom program login or register path, redirect to /programs/:programSlug
      const programSlugRegex = /^\/([^\/]+)\/(login|register)$/;
      const match = path.match(programSlugRegex);
      if (match) {
        return NextResponse.redirect(new URL(`/programs/${match[1]}`, req.url));
      }
      return NextResponse.redirect(new URL("/", req.url)); // Redirect authenticated users to dashboard
    } else if (partnersRedirect(path)) {
      return NextResponse.redirect(
        new URL(`${partnersRedirect(path)}${searchParamsString}`, req.url),
      );
    }
  }

  return NextResponse.rewrite(new URL(`/partners.dub.co${fullPath}`, req.url));
}
