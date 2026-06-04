import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PasskeyList } from '@/components/settings/PasskeyList';
import { SessionList } from '@/components/settings/SessionList';

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <Tabs defaultValue="passkeys">
        <TabsList>
          <TabsTrigger value="passkeys">Passkeys</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>
        <TabsContent value="passkeys">
          <PasskeyList />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionList />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
