import AppLayout from '../components/AppLayout';
import Timer from '../components/Timer';
import Scratchpad from '../components/Scratchpad';
import StatsGrid from '../components/StatsGrid';
import api from '../utils/api';

function downloadExport(url, filename) {
  api.get(url, { responseType: 'blob' }).then(({ data, headers }) => {
    const blob = new Blob([data]);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }).catch(() => {});
}

export default function DashboardPage() {
  return (
    <AppLayout>
      <main className="dashboard">
        <div className="dashboard-left">
          <StatsGrid />
        </div>
        <div className="dashboard-center">
          <Timer />
          <Scratchpad />
        </div>
        <div className="dashboard-right">
          <div className="card quick-actions-card">
            <span className="eyebrow">Quick Actions</span>
            <div className="quick-actions">
              <a href="/log" className="btn btn-primary btn-sm btn-full">
                + Log Problem
              </a>
              <a href="/journal" className="btn btn-secondary btn-sm btn-full">
                ✏️ New Journal Entry
              </a>
            </div>
          </div>
          <div className="card export-card">
            <span className="eyebrow">Export Data</span>
            <div className="quick-actions">
              <button onClick={() => downloadExport('/export/problems?format=csv', 'problems.csv')} className="btn btn-secondary btn-sm btn-full">
                📥 Problems (CSV)
              </button>
              <button onClick={() => downloadExport('/export/journals?format=csv', 'journals.csv')} className="btn btn-secondary btn-sm btn-full">
                📥 Journals (CSV)
              </button>
              <button onClick={() => downloadExport('/export/all?format=json', 'full_export.json')} className="btn btn-secondary btn-sm btn-full">
                💾 Full Export (JSON)
              </button>
            </div>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
