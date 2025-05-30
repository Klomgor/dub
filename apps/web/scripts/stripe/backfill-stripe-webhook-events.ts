import { prisma } from "@dub/prisma";
import "dotenv-flow/config";
import { stripeAppClient } from "../../lib/stripe";

const stripeAccountId = "xxx";

async function main() {
  const customers = await prisma.customer.findMany({
    where: {
      projectConnectId: stripeAccountId,
      createdAt: {
        gte: new Date("2024-12-19 00:00:00.000"),
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    skip: 10,
    take: 10,
  });

  console.table(customers, ["name", "email", "stripeCustomerId", "createdAt"]);

  await Promise.allSettled(
    customers.map(async (customer) => {
      if (!customer.email) return;
      if (customer.stripeCustomerId) return;

      const stripeCustomer = await stripeAppClient({
        livemode: false,
      }).customers.list(
        {
          email: customer.email,
        },
        {
          stripeAccount: stripeAccountId,
        },
      );

      if (stripeCustomer.data.length === 0) {
        console.log(`No stripe customer found for ${customer.email}`);
        return;
      }

      const stripeCustomerId = stripeCustomer.data[0].id;

      await prisma.customer.update({
        where: { id: customer.id },
        data: { stripeCustomerId },
      });

      console.log(
        `Updated stripe customer id for ${customer.email}: ${stripeCustomerId}`,
      );
    }),
  );
}

main();
