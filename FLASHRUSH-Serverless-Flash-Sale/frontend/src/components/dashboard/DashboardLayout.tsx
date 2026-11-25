import { useEffect, useState } from 'react';
import { Outlet, useOutletContext, useLocation } from 'react-router-dom';
import { dashboardService } from '../../services/dashboardService';
import type { DashboardScenario, DashboardSnapshot } from '../../types/dashboard';

type DashboardResult =
  | { status: 'loading' }
  | { status: 'success'; snapshot: DashboardSnapshot }
  | { status: 'error'; message: string };

interface DashboardContext {
  scenario: DashboardScenario;
  result: DashboardResult;
  setScenario: (scenario: DashboardScenario) => void;
  refresh: () => void;
}

export const scenarioLabels: Record<DashboardScenario, string> = {
  warning: 'Cảnh báo DLQ',
  healthy: 'Vận hành bình thường',
  empty: 'Không có dữ liệu',
  error: 'Lỗi tải dữ liệu',
};
const scenarioKey = 'flashrush.demo.dashboardScenario.v1';

function readScenario(): DashboardScenario {
  try {
    const scenario = sessionStorage.getItem(scenarioKey);
    if (scenario && Object.hasOwn(scenarioLabels, scenario)) return scenario as DashboardScenario;
  } catch {
    // The dashboard also works when browser storage is unavailable.
  }
  return 'warning';
}

export function DashboardLayout() {
  const monitoring = useLocation().pathname === '/admin/monitoring';
  const [request, setRequest] = useState(() => ({ scenario: readScenario() }));
  const [result, setResult] = useState<DashboardResult>({ status: 'loading' });

  useEffect(() => {
    if (monitoring) return;
    let active = true;
    void dashboardService.getDashboardSnapshot(request.scenario).then(
      snapshot => { if (active) setResult({ status: 'success', snapshot }); },
      (error: unknown) => {
        if (active) setResult({ status: 'error', message: error instanceof Error ? error.message : 'Vui lòng thử lại.' });
      },
    );
    return () => { active = false; };
  }, [request, monitoring]);

  function load(scenario: DashboardScenario) {
    setResult({ status: 'loading' });
    setRequest({ scenario });
  }

  function setScenario(scenario: DashboardScenario) {
    try {
      sessionStorage.setItem(scenarioKey, scenario);
    } catch {
      // Keep the selected scenario for the current screen.
    }
    load(scenario);
  }

  const context: DashboardContext = { scenario: request.scenario, result, setScenario, refresh: () => load(request.scenario) };
  return (
    <div className="dash">
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      <Outlet context={context} />
    </div>
  );
}

export const useDashboard = () => useOutletContext<DashboardContext>();
