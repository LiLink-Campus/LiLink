export default function DashboardLoading() {
  return (
    <div
      className="app-page-shell app-loading-shell"
      aria-busy="true"
      aria-label="正在加载 Dashboard"
    >
      <section className="app-page-header">
        <div className="app-loading-pill" />
        <div className="app-loading-line is-title" />
        <div className="app-loading-line" />
        <p className="app-loading-status">正在加载…</p>
      </section>

      <section className="app-card-grid">
        <div className="app-card app-loading-card">
          <div className="app-loading-line is-short" />
          <div className="app-loading-block" />
          <div className="app-loading-line" />
        </div>
        <div className="app-card app-loading-card">
          <div className="app-loading-line is-short" />
          <div className="app-loading-block" />
          <div className="app-loading-line" />
        </div>
      </section>
    </div>
  );
}
