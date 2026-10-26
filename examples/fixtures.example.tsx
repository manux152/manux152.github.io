// Example: app/fixtures.tsx (add <Seo/> at the top of your existing screen)
import { Seo } from '../components/Seo';

export default function Fixtures() {
  return (
    <>
      <Seo
        title="Fixtures & Results"
        description="Upcoming fixtures and latest match results for Super Strikers. Dates, venues and kick-off times."
        path="/fixtures"
      />
      {/* ...your existing screen... */}
    </>
  );
}
