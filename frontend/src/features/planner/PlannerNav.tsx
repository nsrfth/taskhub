import { NavLink } from 'react-router-dom';
import { useT } from '@/lib/i18n';

const TABS = [
  { to: '/planner/board', labelKey: 'planner.nav.board', end: false },
  { to: '/planner/calendar', labelKey: 'planner.nav.calendar', end: true },
  { to: '/planner/charts', labelKey: 'planner.nav.charts', end: true },
  { to: '/planner/grid', labelKey: 'planner.nav.grid', end: true },
  { to: '/planner/my-tasks', labelKey: 'planner.nav.myTasks', end: true },
] as const;

export default function PlannerNav(): JSX.Element {
  const t = useT();
  return (
    <nav
      className="flex flex-wrap gap-1 mb-6 border-b border-slate-200 dark:border-slate-700 pb-2"
      aria-label="Planner views"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            [
              'px-3 py-1.5 rounded-t text-sm font-medium transition-colors',
              isActive
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            ].join(' ')
          }
        >
          {t(tab.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}
