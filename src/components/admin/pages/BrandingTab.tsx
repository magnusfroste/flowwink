import { Navigate } from 'react-router-dom';

/**
 * When the Branding tab is selected on the Pages page,
 * we redirect to the dedicated branding page which has its own
 * complex state management and unsaved-changes handling.
 */
export default function BrandingTab() {
  return <Navigate to="/admin/branding" replace />;
}
