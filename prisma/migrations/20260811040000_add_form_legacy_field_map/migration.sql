-- 設問を作り直して項目IDが変わったとき、過去の回答を現在の設問に結びつける対応表
-- JSON: { "<過去の回答キー>": "<現在のfieldId>" }
ALTER TABLE "Form" ADD COLUMN "legacyFieldMap" TEXT;
