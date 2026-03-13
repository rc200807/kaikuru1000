-- 旧形式（KK-YYYY-XXXX-NNNN 等）の未使用ライセンスキーを削除
-- 新形式: KA[A-Z][0-9]{10} (例: KAZ9961583613)
DELETE FROM "LicenseKey"
WHERE key !~ '^KA[A-Z][0-9]{10}$'
  AND id NOT IN (
    SELECT "licenseKeyId" FROM "User" WHERE "licenseKeyId" IS NOT NULL
  );
