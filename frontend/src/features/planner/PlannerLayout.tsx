import { Outlet } from 'react-router-dom';
import PlannerNav from './PlannerNav';

export default function PlannerLayout(): JSX.Element {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PlannerNav />
      <Outlet />
    </div>
  );
}
