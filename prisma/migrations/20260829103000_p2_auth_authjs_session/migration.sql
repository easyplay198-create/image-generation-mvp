-- CreateTable
CREATE TABLE "P2AuthVerificationToken" (
    "identifier" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "P2AuthVerificationToken_pkey" PRIMARY KEY ("identifier", "tokenHash")
);

-- CreateTable
CREATE TABLE "P2AuthSession" (
    "sessionToken" TEXT NOT NULL,
    "userActorId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "P2AuthSession_pkey" PRIMARY KEY ("sessionToken")
);

-- CreateIndex
CREATE INDEX "P2AuthSession_userActorId_expires_idx"
ON "P2AuthSession"("userActorId", "expires");

-- AddForeignKey
ALTER TABLE "P2AuthSession"
ADD CONSTRAINT "P2AuthSession_userActorId_fkey"
FOREIGN KEY ("userActorId") REFERENCES "UserActor"("userActorId")
ON DELETE RESTRICT ON UPDATE CASCADE;
