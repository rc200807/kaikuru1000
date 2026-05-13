-- Store.stripeCustomerId 追加
ALTER TABLE "Store" ADD COLUMN "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX "Store_stripeCustomerId_key" ON "Store"("stripeCustomerId");
