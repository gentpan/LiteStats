import type { AuthenticatorTransportFuture, WebAuthnCredential } from "@simplewebauthn/server";
import { prisma } from "@/lib/db";

export async function listPasskeys(userId: string) {
  return prisma.passkey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      deviceName: true,
      credentialId: true,
      backedUp: true,
      transports: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });
}

export async function getPasskeyByCredentialId(credentialId: string) {
  return prisma.passkey.findUnique({
    where: { credentialId },
    include: { user: true },
  });
}

export function toWebAuthnCredential(passkey: {
  credentialId: string;
  publicKey: Uint8Array | Buffer;
  counter: bigint;
  transports: string[];
}): WebAuthnCredential {
  const publicKey = new Uint8Array(passkey.publicKey);

  return {
    id: passkey.credentialId,
    publicKey,
    counter: Number(passkey.counter),
    transports: passkey.transports as AuthenticatorTransportFuture[],
  };
}

export async function createPasskey(params: {
  userId: string;
  credential: WebAuthnCredential;
  deviceName: string;
  backedUp: boolean;
}) {
  return prisma.passkey.create({
    data: {
      userId: params.userId,
      credentialId: params.credential.id,
      publicKey: Buffer.from(params.credential.publicKey),
      counter: BigInt(params.credential.counter),
      deviceName: params.deviceName,
      transports: params.credential.transports ?? [],
      backedUp: params.backedUp,
    },
  });
}

export async function updatePasskeyCounter(credentialId: string, counter: number) {
  return prisma.passkey.update({
    where: { credentialId },
    data: {
      counter: BigInt(counter),
      lastUsedAt: new Date(),
    },
  });
}

export async function deletePasskey(userId: string, passkeyId: string) {
  const passkey = await prisma.passkey.findFirst({
    where: { id: passkeyId, userId },
  });

  if (!passkey) {
    return null;
  }

  await prisma.passkey.delete({ where: { id: passkey.id } });
  return passkey;
}

export async function renamePasskey(userId: string, passkeyId: string, deviceName: string) {
  const passkey = await prisma.passkey.findFirst({
    where: { id: passkeyId, userId },
  });

  if (!passkey) {
    return null;
  }

  return prisma.passkey.update({
    where: { id: passkey.id },
    data: { deviceName },
  });
}

export async function getPasskeyExcludeList(userId: string) {
  const passkeys = await prisma.passkey.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  return passkeys.map((passkey) => ({
    id: passkey.credentialId,
    transports: passkey.transports as AuthenticatorTransportFuture[],
  }));
}

export async function getPasskeyAllowList(userId: string) {
  const passkeys = await prisma.passkey.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  return passkeys.map((passkey) => ({
    id: passkey.credentialId,
    transports: passkey.transports as AuthenticatorTransportFuture[],
  }));
}
