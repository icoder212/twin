import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/feedback';

export function NotFoundPage() {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <EmptyState
        icon={Compass}
        title="We could not find that page"
        description="It may have moved, or it is not part of your desk."
        action={
          <Button asChild variant="primary" size="sm">
            <Link to="/desk">Back to your desk</Link>
          </Button>
        }
      />
    </div>
  );
}
