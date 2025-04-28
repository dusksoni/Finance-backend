/*
  Warnings:

  - You are about to drop the `AdminActionLog` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `maxLength` to the `PhotoIdType` table without a default value. This is not possible if the table is not empty.
  - Added the required column `minLength` to the `PhotoIdType` table without a default value. This is not possible if the table is not empty.
  - Added the required column `numberTypeEg` to the `PhotoIdType` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AdminActionLog" DROP CONSTRAINT "AdminActionLog_adminId_fkey";

-- AlterTable
ALTER TABLE "PhotoIdType" ADD COLUMN     "maxLength" INTEGER NOT NULL,
ADD COLUMN     "minLength" INTEGER NOT NULL,
ADD COLUMN     "numberTypeEg" TEXT NOT NULL,
ADD COLUMN     "validation" TEXT;

-- DropTable
DROP TABLE "AdminActionLog";

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "employeeId" TEXT,
    "loginActivityId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "table" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_loginActivityId_fkey" FOREIGN KEY ("loginActivityId") REFERENCES "LoginActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
