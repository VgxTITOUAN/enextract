import pool from '@/lib/db';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export async function createNotification(opts: {
  userId: number;
  message: string;
  type: NotificationType;
  lienRedirection?: string | null;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO notifications (user_id, message, type, lien_redirection, lu, date_envoi)
     VALUES (?, ?, ?, ?, 0, NOW())`,
    [opts.userId, opts.message, opts.type, opts.lienRedirection ?? null],
  );
}

export async function notifyAdmins(opts: {
  message: string;
  type: NotificationType;
  lienRedirection?: string | null;
}): Promise<void> {
  const [rows]: any = await pool.execute(
    `SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL AND active = 1`,
  );

  for (const admin of rows) {
    await createNotification({
      userId: admin.id,
      message: opts.message,
      type: opts.type,
      lienRedirection: opts.lienRedirection,
    });
  }
}
