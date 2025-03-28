import { getAnalytics } from "@/lib/analytics/get-analytics";
import { NewLinkProps } from "@/lib/types";
import { sendWorkspaceWebhook } from "@/lib/webhook/publish";
import { ABTestVariantsSchema, linkEventSchema } from "@/lib/zod/schemas/links";
import { Link, Project } from "@prisma/client";
import { waitUntil } from "@vercel/functions";
import { updateLink } from "./update-link";

export async function completeABTests(link: Link & { project: Project }) {
  if (!link.testVariants || !link.testCompletedAt || !link.projectId) {
    return;
  }

  const testVariants = ABTestVariantsSchema.parse(link.testVariants);

  const analytics: { url: string; leads: number }[] = await getAnalytics({
    event: "leads",
    groupBy: "top_urls",
    linkId: link.id,
    workspaceId: link.projectId,
    dataAvailableFrom: link.project.createdAt,
    start: link.testStartedAt ? new Date(link.testStartedAt) : undefined,
    end: link.testCompletedAt,
  });

  const max = Math.max(
    ...testVariants.map(
      (test) => analytics.find(({ url }) => url === test.url)?.leads || 0,
    ),
  );

  // There are no leads generated for any test variant, do nothing
  if (max === 0) {
    console.log(
      `AB Test completed but all results are zero for ${link.id}, doing nothing.`,
    );
    return;
  }

  const winners = testVariants.filter(
    (test) =>
      (analytics.find(({ url }) => url === test.url)?.leads || 0) === max,
  );

  // this should NEVER happen, but just in case
  if (winners.length === 0) {
    console.log(
      `AB Test completed but failed to find winners based on max leads for link ${link.id}, doing nothing.`,
    );
    return;
  }

  const winner = winners[Math.floor(Math.random() * winners.length)];

  if (winner.url === link.url) {
    return;
  }

  // Update the link's URL to the winner
  const { project, ...originalLink } = link;

  const updatedLink = {
    ...originalLink,
    url: winner.url,
    // all these are just to make TypeScript happy – we should create a helper fn for these later
    expiresAt:
      link.expiresAt instanceof Date
        ? link.expiresAt.toISOString()
        : link.expiresAt,
    geo: link.geo as NewLinkProps["geo"],
    testVariants: link.testVariants as NewLinkProps["testVariants"],
    testCompletedAt:
      link.testCompletedAt instanceof Date
        ? link.testCompletedAt.toISOString()
        : link.testCompletedAt,
    testStartedAt:
      link.testStartedAt instanceof Date
        ? link.testStartedAt.toISOString()
        : link.testStartedAt,
  };

  const response = await updateLink({
    oldLink: {
      domain: link.domain,
      key: link.key,
      image: link.image,
    },
    updatedLink,
  });

  waitUntil(
    sendWorkspaceWebhook({
      trigger: "link.updated",
      workspace: link.project,
      data: linkEventSchema.parse(response),
    }),
  );
}
