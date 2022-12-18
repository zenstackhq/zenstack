-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "zenstack_transaction" TEXT;

-- AlterTable
ALTER TABLE "List" ADD COLUMN     "zenstack_transaction" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "zenstack_transaction" TEXT;

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "zenstack_transaction" TEXT;

-- AlterTable
ALTER TABLE "SpaceUser" ADD COLUMN     "zenstack_transaction" TEXT;

-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "zenstack_transaction" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "zenstack_transaction" TEXT;

-- AlterTable
ALTER TABLE "VerificationToken" ADD COLUMN     "zenstack_transaction" TEXT;
