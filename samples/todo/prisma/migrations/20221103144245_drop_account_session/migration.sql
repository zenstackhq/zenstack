/*
  Warnings:

  - You are about to drop the `Account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VerificationToken` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `password` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "password" SET NOT NULL;

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "Session";

-- DropTable
DROP TABLE "VerificationToken";

-- CreateIndex
CREATE INDEX "List_zenstack_transaction_idx" ON "List"("zenstack_transaction");

-- CreateIndex
CREATE INDEX "Space_zenstack_transaction_idx" ON "Space"("zenstack_transaction");

-- CreateIndex
CREATE INDEX "SpaceUser_zenstack_transaction_idx" ON "SpaceUser"("zenstack_transaction");

-- CreateIndex
CREATE INDEX "Todo_zenstack_transaction_idx" ON "Todo"("zenstack_transaction");

-- CreateIndex
CREATE INDEX "User_zenstack_transaction_idx" ON "User"("zenstack_transaction");
