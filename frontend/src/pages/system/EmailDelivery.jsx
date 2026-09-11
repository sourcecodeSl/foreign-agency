import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { IconMail, IconRefresh, IconCheck, IconX } from '../../components/ui/Icons';
import { systemApi } from '../../lib/api';

/** Turns the mail server's error into the step that fixes it. */
export function hintFor(error = '') {
  const e = String(error).toLowerCase();

  if (e.includes('not set up')) {
    return 'Put the MAIL_ settings into the .env file shown above, then press Check again.';
  }
  if (e.includes('535') || e.includes('username and password not accepted') || e.includes('authenticate')) {
    return 'Gmail refused the login. MAIL_PASSWORD must be a Gmail App Password (not your normal password), without spaces, and MAIL_USERNAME the Gmail address it belongs to.';
  }
  if (
    e.includes('connection refused') ||
    e.includes('could not be established') ||
    e.includes('unable to connect') ||
    e.includes('timed out') ||
    e.includes('network is unreachable')
  ) {
    // Worded as "set X to Y": the pre-commit hook reads a MAIL_ host, username
    // or password setting followed by an equals sign as a real credential.
    return 'This server cannot reach Gmail - most shared hosts block outgoing SMTP. Create an email account in cPanel > Email Accounts and use it instead: set MAIL_HOST to mail.<your domain>, MAIL_PORT to 465, MAIL_SCHEME to smtps, MAIL_USERNAME and MAIL_FROM_ADDRESS to that address, and MAIL_PASSWORD to its password.';
  }
  if (e.includes('certificate') || e.includes('ssl') || e.includes('tls')) {
    return 'The secure connection failed. With port 587 leave MAIL_SCHEME=null; with port 465 set MAIL_SCHEME=smtps.';
  }
  return 'Check the MAIL_ settings in the .env file shown above.';
}

/** The one line that says what is wrong, most basic problem first. */
function verdict(s) {
  if (!s.envFileExists) {
    return {
      tone: 'red',
      text:
        'There is no .env file at ' +
        s.envFile +
        '. The settings you edited are in a different folder - put them in this one.',
    };
  }
  if (s.configCached) {
    return {
      tone: 'amber',
      text: 'The settings are cached, so changes to .env are ignored. Press "Clear cached settings", then Check again.',
    };
  }
  if (!s.configured) {
    const missing = [];
    if (s.mailer === 'log' || s.mailer === 'array') missing.push('MAIL_MAILER is "' + s.mailer + '" (it must be smtp)');
    if (!s.usernameSet) missing.push('MAIL_USERNAME is empty');
    if (!s.passwordSet) missing.push('MAIL_PASSWORD is empty');
    return {
      tone: 'amber',
      text:
        'Email is not set up in ' +
        s.envFile +
        (missing.length ? ': ' + missing.join(', ') : '') +
        '. Until it is, sign-in codes are shown on screen instead of emailed.',
    };
  }
  return { tone: 'green', text: 'Email is set up. Send a test email to make sure it really arrives.' };
}

const TONES = {
  red: 'border-red-200 bg-red-50 text-red-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-3 gap-3 px-3.5 py-2.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="col-span-2 break-all text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function YesNo({ value, good }) {
  return (
    <span className={value === good ? 'text-emerald-700' : 'font-medium text-red-600'}>
      {value ? 'Yes' : 'No'}
    </span>
  );
}

/**
 * What this server actually reads for email, and a test that proves whether a
 * sign-in code can reach an inbox - with the mail server's real error if not.
 */
export default function EmailDelivery() {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const { data } = await systemApi.mailStatus();
      setStatus(data);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Could not read the email settings.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const sendTest = async () => {
    setSending(true);
    setResult(null);
    try {
      const { data } = await systemApi.sendTestMail();
      setResult(data);
    } catch (err) {
      setResult({ delivered: false, error: err.message || 'The test could not be run.' });
    } finally {
      setSending(false);
    }
  };

  const clearCache = async () => {
    setClearing(true);
    try {
      const { message } = await systemApi.clearConfigCache();
      toast(message || 'Cached settings cleared.');
      await check();
    } catch (err) {
      toast(err.message || 'Could not clear the cached settings.', 'error');
    } finally {
      setClearing(false);
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl">
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {loadError}
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-sm text-gray-500">
        Checking email settings...
      </div>
    );
  }

  const v = verdict(status);
  const dash = (value) => value || '-';

  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardHeader
          title="Email delivery"
          subtitle="What this server reads for email, and whether a sign-in code can reach an inbox."
        />
        <CardBody className="space-y-5">
          <div role="status" className={'rounded-lg border px-4 py-3 text-sm font-medium ' + TONES[v.tone]}>
            {v.text}
          </div>

          <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            <Row label="Settings file">
              <code className="font-mono text-xs">{status.envFile}</code>
              {!status.envFileExists && <span className="ml-2 font-medium text-red-600">(missing)</span>}
            </Row>
            <Row label="Settings cached">
              <YesNo value={status.configCached} good={false} />
            </Row>
            <Row label="MAIL_MAILER">{dash(status.mailer)}</Row>
            <Row label="MAIL_HOST : PORT">{dash(status.host) + ' : ' + dash(status.port)}</Row>
            <Row label="MAIL_FROM_ADDRESS">{dash(status.fromAddress)}</Row>
            <Row label="MAIL_USERNAME set">
              <YesNo value={status.usernameSet} good />
            </Row>
            <Row label="MAIL_PASSWORD set">
              <YesNo value={status.passwordSet} good />
            </Row>
          </dl>

          {result && (
            <div className={'rounded-lg border px-4 py-3 text-sm ' + (result.delivered ? TONES.green : TONES.red)}>
              <p className="flex items-center gap-2 font-semibold">
                {result.delivered ? <IconCheck className="h-4 w-4" /> : <IconX className="h-4 w-4" />}
                {result.delivered
                  ? 'Test email sent to ' + result.to + '. Check the inbox (and Spam).'
                  : 'The test email could not be sent.'}
              </p>
              {!result.delivered && (
                <>
                  <p className="mt-2 break-words font-mono text-xs">{result.error}</p>
                  <p className="mt-2">{hintFor(result.error)}</p>
                </>
              )}
            </div>
          )}
        </CardBody>

        <CardFooter className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="secondary" icon={IconRefresh} loading={checking} onClick={check}>
            Check again
          </Button>
          {status.configCached && (
            <Button type="button" variant="secondary" loading={clearing} onClick={clearCache}>
              Clear cached settings
            </Button>
          )}
          <Button type="button" icon={IconMail} loading={sending} onClick={sendTest}>
            {sending ? 'Sending...' : 'Send test email to ' + (status.testRecipient || 'me')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
