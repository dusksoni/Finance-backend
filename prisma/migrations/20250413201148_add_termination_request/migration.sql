/*
  Warnings:

  - You are about to drop the column `docUrl` on the `TerminationRequest` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TerminationRequest" DROP COLUMN "docUrl",
ADD COLUMN     "docFileId" TEXT;

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TerminationRequest" ADD CONSTRAINT "TerminationRequest_docFileId_fkey" FOREIGN KEY ("docFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
