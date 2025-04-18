import { getCustomerEvents } from "@/lib/analytics/get-customer-events";
import { getCustomerOrThrow } from "@/lib/api/customers/get-customer-or-throw";
import { decodeLinkIfCaseSensitive } from "@/lib/api/links/case-sensitivity";
import { withWorkspace } from "@/lib/auth";
import { customerActivityResponseSchema } from "@/lib/zod/schemas/customer-activity";
import { prisma } from "@dub/prisma";
import { NextResponse } from "next/server";

// GET /api/customers/[id]/activity - get a customer's activity
export const GET = withWorkspace(async ({ workspace, params, session }) => {
  const { id: customerId } = params;

  const customer = await getCustomerOrThrow({
    workspaceId: workspace.id,
    id: customerId,
  });

  const events = await getCustomerEvents({
    customerId: customer.id,
  });

  // get the first partner link that this customer interacted with
  const firstLinkId = events[events.length - 1].link_id;

  let link = await prisma.link.findUniqueOrThrow({
    where: {
      id: firstLinkId,
    },
    select: {
      id: true,
      domain: true,
      key: true,
      shortLink: true,
    },
  });

  link = decodeLinkIfCaseSensitive(link);

  // Find the LTV of the customer
  // TODO: Calculate this from all events, not limited
  const ltv = events.reduce((acc, event) => {
    if (event.event === "sale" && event.saleAmount) {
      acc += Number(event.saleAmount);
    }

    return acc;
  }, 0);

  // Find the time to lead of the customer
  const timeToLead =
    customer.clickedAt && customer.createdAt
      ? customer.createdAt.getTime() - customer.clickedAt.getTime()
      : null;

  // Find the time to first sale of the customer
  // TODO: Calculate this from all events, not limited
  const firstSale = events.filter(({ event }) => event === "sale").pop();

  const timeToSale =
    firstSale && customer.createdAt
      ? new Date(firstSale.timestamp).getTime() - customer.createdAt.getTime()
      : null;

  return NextResponse.json(
    customerActivityResponseSchema.parse({
      ltv,
      timeToLead,
      timeToSale,
      events,
      link,
    }),
  );
});
