export default function DashboardLoading() {
  return (
    <main className="alibi-page relative w-full">
      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col gap-6 p-8">
        <div className="alibi-pill h-14" />
        <header className="px-2 sm:px-4">
          <div className="h-8 w-56 rounded-2xl bg-alibi-lavender/20" />
          <div className="mt-3 h-5 w-80 max-w-full rounded-2xl bg-alibi-lavender/20" />
        </header>
        <div className="alibi-card h-28 animate-pulse" />
        <div className="alibi-card h-64 animate-pulse" />
        <div className="alibi-card h-64 animate-pulse" />
      </div>
    </main>
  )
}
