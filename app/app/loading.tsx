export default function AppLoading() {
  return (
    <main className="alibi-page px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="alibi-pill h-14" />
        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          <div className="flex flex-col gap-5">
            <div className="alibi-card-pop h-52 animate-pulse" />
            <div className="alibi-card h-96 animate-pulse" />
          </div>
          <div className="alibi-card min-h-130 animate-pulse" />
        </section>
      </div>
    </main>
  )
}
