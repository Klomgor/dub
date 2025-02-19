import { RewardProp } from "@/lib/types";
import { ProgramSchema } from "@/lib/zod/schemas/programs";
import { RewardSchema } from "@/lib/zod/schemas/rewards";
import { prisma } from "@dub/prisma";
import { DubApiError } from "../errors";

export const getProgramOrThrow = async (
  {
    workspaceId,
    programId,
  }: {
    workspaceId: string;
    programId: string;
  },
  {
    includeDiscounts = false,
    includeDefaultReward = false,
  }: {
    includeDiscounts?: boolean;
    includeDefaultReward?: boolean;
  } = {},
) => {
  const program = await prisma.program.findUnique({
    where: {
      id: programId,
      workspaceId,
    },
    ...(includeDiscounts
      ? {
          include: {
            discounts: {
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        }
      : {}),
  });

  if (!program) {
    throw new DubApiError({
      code: "not_found",
      message: "Program not found",
    });
  }

  let defaultReward: RewardProp | null = null;

  if (includeDefaultReward && program.defaultRewardId) {
    defaultReward = await prisma.reward.findUniqueOrThrow({
      where: {
        id: program.defaultRewardId,
      },
    });

    defaultReward = RewardSchema.parse(defaultReward);
  }

  return ProgramSchema.parse({
    ...program,
    ...(defaultReward ? { rewards: [defaultReward] } : {}),
  });
};
