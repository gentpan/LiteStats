import { prisma } from "@/lib/db";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type ChallengeType = "registration" | "authentication";

export async function saveChallenge(params: {
  challenge: string;
  type: ChallengeType;
  userId?: string;
  username?: string;
}) {
  await cleanupExpiredChallenges();

  return prisma.webAuthnChallenge.create({
    data: {
      challenge: params.challenge,
      type: params.type,
      userId: params.userId,
      username: params.username,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
}

export async function consumeChallenge(challenge: string, type: ChallengeType) {
  const record = await prisma.webAuthnChallenge.findFirst({
    where: {
      challenge,
      type,
      expiresAt: { gt: new Date() },
    },
  });

  if (!record) {
    return null;
  }

  await prisma.webAuthnChallenge.delete({ where: { id: record.id } });
  return record;
}

async function cleanupExpiredChallenges() {
  await prisma.webAuthnChallenge.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
}
