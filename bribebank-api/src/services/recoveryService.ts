import { prisma } from "../lib/prisma.js";
import { generateRecoveryKey, hashRecoveryKey } from "../lib/recoveryKey.js";

export async function rotateFamilyRecoveryKey(familyId: string): Promise<{
  recoveryKey: string;
  updatedAt: Date;
}> {
  const recoveryKey = generateRecoveryKey();
  const hash = await hashRecoveryKey(recoveryKey);
  const updatedAt = new Date();

  await prisma.family.update({
    where: { id: familyId },
    data: {
      passwordRecoveryKeyHash: hash,
      passwordRecoveryKeyUpdatedAt: updatedAt,
    },
  });

  return { recoveryKey, updatedAt };
}

