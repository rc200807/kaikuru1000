import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FFFBFE] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-3xl font-bold text-red-700 tracking-tight mb-1">買いクル</h1>
        <p className="text-sm text-gray-400 mb-12">出張買取サービス 管理システム</p>

        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="w-full bg-red-700 text-white py-3.5 rounded-full text-sm font-medium hover:bg-red-800 transition-colors"
          >
            顧客マイページ
          </Link>
        </div>
      </div>
    </div>
  );
}
