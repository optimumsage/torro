import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-4xl font-bold">404</p>
      <p className="text-muted-foreground">This page could not be found.</p>
      <Button asChild>
        <Link to="/">Back to Torro</Link>
      </Button>
    </div>
  );
}
