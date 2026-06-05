import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import Topbar from '@/components/Topbar';
import NotificationsClient from '@/components/NotificationsClient';

export default async function NotificationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('enextract_token')?.value;
  if (!token) redirect('/login');
  const user = verifyToken(token);
  if (!user) redirect('/login');

  return (
    <>
      <Topbar title="Notifications" userName={user.name} />
      <main className="p-6 max-w-2xl">
        <NotificationsClient />
      </main>
    </>
  );
}
