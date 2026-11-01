import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/feedback';

export function ForbiddenState() {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <EmptyState
        icon={ShieldAlert}
        title="Your role does not include this"
        description="Ask an administrator if you need access. Every access decision is enforced by the server and logged."
        action={
          <Button asChild size="sm">
            <Link to="/desk">Back to your desk</Link>
          </Button>
        }
      />
    </div>
  );
}
