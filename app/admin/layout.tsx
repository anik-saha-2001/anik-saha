import AdminTopbar from "@/components/admin/AdminTopbar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AdminTopbar />
      <div className="mx-auto max-w-5xl px-5 py-10">{children}</div>
    </div>
  );
}
