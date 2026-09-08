import { IconCheck } from '../ui/Icons';

/**
 * Two-factor progress rail shown above the OTP form, so it is obvious that
 * both the phone and the email must be confirmed before sign-in completes.
 *
 * @param {'phone'|'email'} current
 */
export default function StepIndicator({ current }) {
  const steps = [
    { id: 'phone', label: 'Phone' },
    { id: 'email', label: 'Email' },
  ];
  const activeIndex = steps.findIndex((s) => s.id === current);

  return (
    <ol className="mb-8 flex items-center gap-2">
      {steps.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;

        return (
          <li key={step.id} className="flex flex-1 items-center gap-2">
            <span
              className={
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ' +
                (done
                  ? 'bg-emerald-600 text-white'
                  : active
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-400')
              }
            >
              {done ? <IconCheck className="h-3.5 w-3.5" /> : index + 1}
            </span>

            <span
              className={
                'text-sm font-medium ' +
                (done ? 'text-emerald-700' : active ? 'text-gray-900' : 'text-gray-400')
              }
            >
              {step.label}
            </span>

            {index < steps.length - 1 && (
              <span
                className={
                  'ml-1 h-0.5 flex-1 rounded-full ' + (done ? 'bg-emerald-500' : 'bg-gray-200')
                }
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
