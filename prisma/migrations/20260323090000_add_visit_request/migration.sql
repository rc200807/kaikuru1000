-- CreateTable
CREATE TABLE "VisitRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "candidate1Date" TIMESTAMP(3) NOT NULL,
    "candidate1Start" TEXT,
    "candidate1End" TEXT,
    "candidate2Date" TIMESTAMP(3) NOT NULL,
    "candidate2Start" TEXT,
    "candidate2End" TEXT,
    "candidate3Date" TIMESTAMP(3) NOT NULL,
    "candidate3Start" TEXT,
    "candidate3End" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedCandidate" INTEGER,
    "counterDate" TIMESTAMP(3),
    "counterStart" TEXT,
    "counterEnd" TEXT,
    "storeNote" TEXT,
    "customerNote" TEXT,
    "visitScheduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitRequest_visitScheduleId_key" ON "VisitRequest"("visitScheduleId");

-- CreateIndex
CREATE INDEX "VisitRequest_userId_idx" ON "VisitRequest"("userId");

-- CreateIndex
CREATE INDEX "VisitRequest_storeId_idx" ON "VisitRequest"("storeId");

-- CreateIndex
CREATE INDEX "VisitRequest_status_idx" ON "VisitRequest"("status");

-- AddForeignKey
ALTER TABLE "VisitRequest" ADD CONSTRAINT "VisitRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRequest" ADD CONSTRAINT "VisitRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
