-- VisitSchedule に買取金額・請求金額カラムを追加
ALTER TABLE "VisitSchedule" ADD COLUMN "purchaseAmount" INTEGER;
ALTER TABLE "VisitSchedule" ADD COLUMN "billingAmount" INTEGER;
