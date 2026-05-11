import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('enextract_token')?.value;

  if (!token) redirect('/login');

  const user = verifyToken(token);
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userName={user.name} userRole={user.role} />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  );
}