import { cookies } from 'next/headers';
import { spawn } from 'child_process';
import { verifyToken } from '@/lib/auth';

const RESTART_FILE = '/srv/customer/sites/enextract.eness.fr/restart.txt';
const APP_ROOT = process.env.DEPLOY_APP_ROOT ?? process.cwd();

const STEPS = [
  { label: 'git pull', command: 'git pull' },
  { label: 'npm install && npm run build', command: 'npm install && npm run build' },
];

function runCommand(command: string, cwd: string, onOutput: (chunk: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      env: process.env,
    });

    child.stdout.on('data', (data: Buffer) => onOutput(data.toString()));
    child.stderr.on('data', (data: Buffer) => onOutput(data.toString()));

    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Commande terminée avec le code ${code}`));
    });
  });
}

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get('enextract_token')?.value;
  if (!token) {
    return new Response(JSON.stringify({ error: 'Non autorisé.' }), { status: 401 });
  }

  const user = verifyToken(token);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Non autorisé.' }), { status: 401 });
  }
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Accès refusé.' }), { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        send('log', { line: `APP_ROOT: ${APP_ROOT}\n` });
        send('log', { line: `process.cwd(): ${process.cwd()}\n` });

        for (const step of STEPS) {
          send('log', { line: `\n▶ ${step.label}...\n` });
          try {
            await runCommand(step.command, APP_ROOT, chunk => {
              if (chunk) send('log', { line: chunk });
            });
          } catch (err: any) {
            send('error', { message: err.message ?? `Échec : ${step.label}` });
            controller.close();
            return;
          }
        }

        send('log', { line: '\n▶ restart...\n' });
        send('done', {});
        controller.close();

        setTimeout(() => {
          spawn(`touch ${RESTART_FILE}`, { shell: true });
        }, 500);
      } catch (err: any) {
        send('error', { message: err.message ?? 'Erreur inattendue.' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
